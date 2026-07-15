import type { MedusaContainer } from "@medusajs/framework/types"

import { TELEGRAM_OPS_MODULE } from "../modules/telegram-ops"
import type TelegramOpsService from "../modules/telegram-ops/service"
import { buildDigest } from "../modules/telegram-ops/commands/digest-data"
import { Sentry } from "../lib/instrument"

// Europe/Amsterdam wall-clock parts of an instant. The job runs HOURLY and
// gates on the local hour instead of encoding the hour in a UTC cron, so DST
// shifts never move the digest (Railway cron runs UTC).
export function amsClock(now: Date): { hour: number; weekday: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return {
    hour: Number(get("hour")) % 24,
    weekday: weekdays[get("weekday")] ?? 0,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  }
}

export function digestHour(): number {
  const n = parseInt(process.env.OPS_DIGEST_HOUR ?? "", 10)
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 18
}

// N16: daily digest at OPS_DIGEST_HOUR (default 18:00 Amsterdam). The
// per-day notify key makes hourly reruns and restarts idempotent.
export async function runDailyDigest(container: MedusaContainer, now: Date): Promise<void> {
  const svc = container.resolve(TELEGRAM_OPS_MODULE) as TelegramOpsService
  if (!svc.isConfigured()) return
  const clock = amsClock(now)
  if (clock.hour !== digestHour()) return
  const text = await buildDigest(container, now)
  await svc.notify(`tg-digest-${clock.dateKey}`, "digest", text, {
    reply_markup: { inline_keyboard: [[{ text: "📝 Todo", callback_data: "tdo" }]] },
  })
}

export default async function telegramDailyDigest(container: MedusaContainer): Promise<void> {
  try {
    await runDailyDigest(container, new Date())
  } catch (e) {
    const logger = container.resolve("logger") as { error: (m: string) => void }
    logger.error(`telegram-daily-digest: ${(e as Error).message}`)
    Sentry.captureException(e, { tags: { job: "telegram-daily-digest" } })
  }
}

export const config = {
  name: "telegram-daily-digest",
  // hourly at :05; the Amsterdam-hour gate above decides when to fire
  schedule: "5 * * * *",
}
