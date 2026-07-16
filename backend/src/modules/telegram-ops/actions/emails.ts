import { getNotification, listOrderEmails, resendOrderEmail } from '../../../lib/order-notifications'
import { escapeHtml, whenAms } from '../format'
import type { CallbackHandler } from '../commands/callbacks'

// eml:<order_id> | list the emails sent for an order as a NEW message with a
// resend button per email. Resends always confirm first (emr -> emrc):
// they land in the customer's inbox.
export const emlAction: CallbackHandler = async (ctx, [orderId]) => {
  if (!orderId) return 'Missing order id'
  const { email, notifications } = await listOrderEmails(ctx.container, orderId)
  if (!email || !notifications.length) {
    await ctx.svc.sendTo(ctx.chatId, 'No emails sent for this order yet.', {})
    return
  }
  const shown = notifications.slice(0, 8)
  const lines = shown.map((n, i) =>
    `${i + 1}. ${escapeHtml(n.template)}${n.status && n.status !== 'success' ? ` (${escapeHtml(n.status)})` : ''} | ${n.created_at ? whenAms(n.created_at as never) : '?'}`
  )
  await ctx.svc.sendTo(
    ctx.chatId,
    [
      `✉️ <b>Emails to ${escapeHtml(email)}</b>`,
      '',
      ...lines,
      ...(notifications.length > shown.length ? [`... and ${notifications.length - shown.length} more`] : []),
    ].join('\n'),
    { reply_markup: { inline_keyboard: shown.map((n, i) => ([
      { text: `↩️ Resend ${i + 1}. ${n.template.slice(0, 20)}`, callback_data: `emr:${n.id}` },
    ])) } }
  )
}

// emr:<notification_id> | confirm prompt (NEW message, so the email list
// stays intact).
export const emrAction: CallbackHandler = async (ctx, [notificationId]) => {
  if (!notificationId) return 'Missing email id'
  const n = await getNotification(ctx.container, notificationId)
  if (!n) return 'Email not found'
  await ctx.svc.sendTo(
    ctx.chatId,
    `⚠️ Resend <b>${escapeHtml(n.template)}</b> to ${escapeHtml(n.to)}? The customer receives it again.`,
    { reply_markup: { inline_keyboard: [[
      { text: '✅ Resend', callback_data: `emrc:${n.id}` },
      { text: '❌ Cancel', callback_data: 'dis' },
    ]] } }
  )
}

// emrc:<notification_id> | the confirmed resend. Claim-first dedups a
// double-tap; released on failure so a retry stays possible.
export const emrcAction: CallbackHandler = async (ctx, [notificationId]) => {
  if (!notificationId) return 'Missing email id'
  const key = `tg-act-eml-${ctx.chatId}-${ctx.messageId}`
  const claimed = await ctx.svc.claimAction(key, 'act_email', ctx.actor, { notification_id: notificationId })
  if (!claimed) return 'Already handled'

  const r = await resendOrderEmail(ctx.container, notificationId)
  if (r.ok) {
    await ctx.svc.editMessage(ctx.chatId, ctx.messageId, `✅ Resent <b>${escapeHtml(r.template)}</b> to ${escapeHtml(r.to)}`)
    return 'Resent'
  }
  await ctx.svc.releaseAction(key)
  // Non-strict tsconfig breaks negative-branch union narrowing; read the
  // failure fields through an explicit shape instead.
  const failure = r as { reason?: string; message?: string }
  await ctx.svc.editMessage(
    ctx.chatId, ctx.messageId,
    `❌ Resend failed${failure.reason === 'not_found' ? ': email not found' : `: ${escapeHtml(failure.message ?? 'unknown error')}`}`
  )
  return 'Resend failed'
}
