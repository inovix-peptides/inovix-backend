import type { MedusaContainer } from "@medusajs/framework/types"

import { TELEGRAM_OPS_MODULE } from "../modules/telegram-ops"
import type TelegramOpsService from "../modules/telegram-ops/service"
import { buildWeekly } from "../modules/telegram-ops/commands/digest-data"
import { Sentry } from "../lib/instrument"
import { amsClock } from "./telegram-daily-digest"

// ISO week key (e.g. 2026-W29) of the Amsterdam calendar date. Standard ISO
// algorithm on the local date: week 1 contains the first Thursday.
export function isoWeekKey(now: Date): string {
  const { dateKey } = amsClock(now)
  const [y, m, d] = dateKey.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${week}`
}

// N17: weekly summary, Monday 09:00 Amsterdam. Hourly job + local-clock gate
// (DST-proof); per-ISO-week notify key keeps reruns idempotent.
export async function runWeeklySummary(container: MedusaContainer, now: Date): Promise<void> {
  const svc = container.resolve(TELEGRAM_OPS_MODULE) as TelegramOpsService
  if (!svc.isConfigured()) return
  const clock = amsClock(now)
  if (clock.weekday !== 1 || clock.hour !== 9) return
  const text = await buildWeekly(container, now)
  await svc.notify(`tg-week-${isoWeekKey(now)}`, "weekly", text)
}

export default async function telegramWeeklySummary(container: MedusaContainer): Promise<void> {
  try {
    await runWeeklySummary(container, new Date())
  } catch (e) {
    const logger = container.resolve("logger") as { error: (m: string) => void }
    logger.error(`telegram-weekly-summary: ${(e as Error).message}`)
    Sentry.captureException(e, { tags: { job: "telegram-weekly-summary" } })
  }
}

export const config = {
  name: "telegram-weekly-summary",
  // hourly at :10; the Monday-09:00-Amsterdam gate above decides when to fire
  schedule: "10 * * * *",
}
