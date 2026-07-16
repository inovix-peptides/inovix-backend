import type { MedusaContainer } from "@medusajs/framework/types"

import { TELEGRAM_OPS_MODULE } from "../modules/telegram-ops"
import type TelegramOpsService from "../modules/telegram-ops/service"
import { escapeHtml, headline } from "../modules/telegram-ops/format"
import { lowStockThreshold } from "../modules/telegram-ops/commands/digest-data"
import { fetchInventoryRows } from "../modules/telegram-ops/commands/inventory-data"
import { Sentry } from "../lib/instrument"

type StockState = "low" | "oos"

// N7/N8: alert ONCE per threshold crossing, not per hourly check. State per
// inventory item lives in telegram_ops_event (key tg-stockstate-<item>,
// payload { state }); recovery above the threshold deletes the row so the
// next drop alerts again. low -> oos escalates (one more alert).
export async function runStockWatch(container: MedusaContainer): Promise<void> {
  const svc = container.resolve(TELEGRAM_OPS_MODULE) as TelegramOpsService
  if (!svc.isConfigured()) return
  const threshold = lowStockThreshold()

  // Human product names (product + variant), not the packaging title.
  const rows = await fetchInventoryRows(container)

  for (const item of rows) {
    const { available, reserved, name } = item
    const current: StockState | null = available <= 0 ? "oos" : available <= threshold ? "low" : null

    const key = `tg-stockstate-${item.id}`
    const stateRow = await svc.findEvent(key)
    const stored = (stateRow?.payload as { state?: StockState } | null)?.state ?? null

    if (!current) {
      if (stateRow) await svc.releaseAction(key) // recovered: re-arm
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
        { text: `➕ Restock ${escapeHtml(name).slice(0, 20)}`, callback_data: `rsk:${item.id}` },
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
