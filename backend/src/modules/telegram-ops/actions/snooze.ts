import { escapeHtml, whenAms } from '../format'
import { stripConfirm, type CallbackHandler } from '../commands/callbacks'

const DAY_MS = 24 * 60 * 60 * 1000

// snz:<event_key>:<days> | pause a reminder (N9/N10). Writes snoozed_until
// on the reminder's event-log row; the slipping-orders job honors it.
export const snzAction: CallbackHandler = async (ctx, [key, daysStr]) => {
  const days = parseInt(daysStr ?? '', 10)
  if (!key || !Number.isInteger(days) || days < 1 || days > 30) return 'Invalid snooze'
  const until = new Date(Date.now() + days * DAY_MS)
  await ctx.svc.touchEvent(key, 'reminder', { snoozed_until: until })
  await ctx.svc.editMessage(
    ctx.chatId, ctx.messageId,
    `${escapeHtml(stripConfirm(ctx.originalText))}\n\n😴 Snoozed until ${whenAms(until)}`
  )
  return `Snoozed ${days}d`
}
