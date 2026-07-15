import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { TELEGRAM_OPS_MODULE } from "../modules/telegram-ops"
import type TelegramOpsService from "../modules/telegram-ops/service"
import { escapeHtml, headline } from "../modules/telegram-ops/format"
import { lowStockThreshold } from "../modules/telegram-ops/commands/digest-data"
import { Sentry } from "../lib/instrument"

type StockState = "low" | "oos"

// N7/N8: alert ONCE per threshold crossing, not per hourly check. State per
// inventory item lives in telegram_ops_event (key tg-stockstate-<item>,
// payload { state }); recovery above the threshold deletes the row so the
// next drop alerts again. low -> oos escalates (one more alert).
export async function runStockWatch(container: MedusaContainer): Promise<void> {
  const svc = container.resolve(TELEGRAM_OPS_MODULE) as TelegramOpsService
  if (!svc.isConfigured()) return
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const threshold = lowStockThreshold()

  const { data } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku", "title", "location_levels.stocked_quantity", "location_levels.reserved_quantity"],
  })

  for (const raw of (data ?? []) as Array<{ id: string; sku?: string | null; title?: string | null; location_levels?: Array<{ stocked_quantity?: number | string; reserved_quantity?: number | string }> } | null>) {
    if (!raw) continue
    const stocked = (raw.location_levels ?? []).reduce((n, l) => n + Number(l?.stocked_quantity ?? 0), 0)
    const reserved = (raw.location_levels ?? []).reduce((n, l) => n + Number(l?.reserved_quantity ?? 0), 0)
    const available = stocked - reserved
    const name = String(raw.title || raw.sku || raw.id)
    const current: StockState | null = available <= 0 ? "oos" : available <= threshold ? "low" : null

    const key = `tg-stockstate-${raw.id}`
    const row = await svc.findEvent(key)
    const stored = (row?.payload as { state?: StockState } | null)?.state ?? null

    if (!current) {
      if (row) await svc.releaseAction(key) // recovered: re-arm
      continue
    }
    if (stored === current || (stored === "oos" && current === "low")) continue // no worsening

    const text = current === "oos"
      ? headline("🔴", `OUT of stock on site: ${name}`)
      : [
          headline("⚠️", `Low stock: ${name}`),
          `${available} left (${reserved} reserved, threshold ${threshold})`,
        ].join("\n")
    await svc.sendToAll(text, {
      reply_markup: { inline_keyboard: [[
        { text: `➕ Restock ${escapeHtml(name).slice(0, 20)}`, callback_data: `rsk:${raw.id}` },
        { text: "📦 Stock", callback_data: "stk" },
      ]] },
    })
    await svc.touchEvent(key, "stock_state", { sent_at: new Date(), payload: { state: current } })
  }
}

export default async function telegramStockWatch(container: MedusaContainer): Promise<void> {
  try {
    await runStockWatch(container)
  } catch (e) {
    const logger = container.resolve("logger") as { error: (m: string) => void }
    logger.error(`telegram-stock-watch: ${(e as Error).message}`)
    Sentry.captureException(e, { tags: { job: "telegram-stock-watch" } })
  }
}

export const config = {
  name: "telegram-stock-watch",
  // hourly, offset from the other telegram jobs
  schedule: "0 * * * *",
}
