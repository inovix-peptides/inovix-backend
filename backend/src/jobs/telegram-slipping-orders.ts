import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import {
  buildVerzendstationQueues,
  QUEUE_ORDER_FIELDS,
  type QueueEntry,
  type QueueOrderRow,
} from "../lib/verzendstation-queues"
import { TELEGRAM_OPS_MODULE } from "../modules/telegram-ops"
import type TelegramOpsService from "../modules/telegram-ops/service"
import { headline } from "../modules/telegram-ops/format"
import { Sentry } from "../lib/instrument"

const DAY_MS = 24 * 60 * 60 * 1000
const SCAN_TAKE = 100

function hoursAgo(iso: string | null, now: Date): number {
  if (!iso) return 0
  return Math.floor((now.getTime() - new Date(iso).getTime()) / (60 * 60 * 1000))
}

// Reminder gate: send when there is no row yet, or the row is not snoozed
// and the last send is older than 24h ("repeats daily until handled").
async function shouldRemind(svc: TelegramOpsService, key: string, now: Date): Promise<boolean> {
  const row = await svc.findEvent(key)
  if (!row) return true
  if (row.snoozed_until && new Date(row.snoozed_until as never) > now) return false
  if (row.sent_at && now.getTime() - new Date(row.sent_at as never).getTime() < DAY_MS) return false
  return true
}

// N9/N10: hourly nudges for orders stuck in the Verzendstation queues for
// more than 24h. Same queue derivation as /station and the daily email
// alert; the Telegram reminders add per-order action buttons + snooze.
export async function runSlippingOrders(container: MedusaContainer, now: Date): Promise<void> {
  const svc = container.resolve(TELEGRAM_OPS_MODULE) as TelegramOpsService
  if (!svc.isConfigured()) return
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "order",
    fields: QUEUE_ORDER_FIELDS,
    pagination: { take: SCAN_TAKE, skip: 0, order: { created_at: "DESC" } },
  })
  const queues = buildVerzendstationQueues(
    ((data ?? []) as Array<QueueOrderRow | null>).filter(Boolean) as QueueOrderRow[]
  )

  const remind = async (
    entry: QueueEntry,
    key: string,
    text: string,
    actionButton: { text: string; callback_data: string }
  ) => {
    if (!(await shouldRemind(svc, key, now))) return
    await svc.sendToAll(text, {
      reply_markup: { inline_keyboard: [[
        actionButton,
        { text: "😴 Snooze 1d", callback_data: `snz:${key}:1` },
      ]] },
    })
    await svc.touchEvent(key, "reminder", { sent_at: now, payload: { order_id: entry.id, display_id: entry.display_id } })
  }

  for (const e of queues.to_process) {
    const age = hoursAgo(e.created_at, now)
    if (age < 24) continue
    await remind(
      e,
      `tg-slip-${e.id}`,
      headline("⏰", `Slipping: #${e.display_id} paid ${age}h ago, no label`),
      { text: "📦 Create label", callback_data: `lbl:${e.id}` }
    )
  }
  for (const e of queues.to_ship) {
    const age = hoursAgo(e.packed_at, now)
    if (age < 24) continue
    await remind(
      e,
      `tg-unship-${e.id}`,
      headline("⏰", `Packed but not shipped: #${e.display_id} (label ${age}h old)`),
      { text: "🚚 Mark shipped", callback_data: `shp:${e.id}:${e.display_id}` }
    )
  }
}

export default async function telegramSlippingOrders(container: MedusaContainer): Promise<void> {
  try {
    await runSlippingOrders(container, new Date())
  } catch (e) {
    const logger = container.resolve("logger") as { error: (m: string) => void }
    logger.error(`telegram-slipping-orders: ${(e as Error).message}`)
    Sentry.captureException(e, { tags: { job: "telegram-slipping-orders" } })
  }
}

export const config = {
  name: "telegram-slipping-orders",
  // hourly at :30, offset from telegram-stock-watch
  schedule: "30 * * * *",
}
