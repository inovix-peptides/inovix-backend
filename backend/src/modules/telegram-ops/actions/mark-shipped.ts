import { markDhlOrderShipped } from '../../../lib/mark-dhl-shipped'
import { escapeHtml } from '../format'
import { CONFIRM_PREFIX, stripConfirm, type CallbackCtx, type CallbackHandler } from '../commands/callbacks'

async function editResult(ctx: CallbackCtx, statusHtml: string): Promise<void> {
  await ctx.svc.editMessage(ctx.chatId, ctx.messageId, `${escapeHtml(stripConfirm(ctx.originalText))}\n\n${statusHtml}`)
}

// First tap: confirm. Marking shipped emails the customer, so it is never a
// single-tap action. Callback args carry [orderId, displayId] so no lookup
// is needed for the prompt.
export const shpAction: CallbackHandler = async (ctx, [orderId, displayId]) => {
  if (!orderId || !displayId) return 'Missing order id'
  await ctx.svc.editMessage(
    ctx.chatId, ctx.messageId,
    `${escapeHtml(stripConfirm(ctx.originalText))}${CONFIRM_PREFIX}Mark #${escapeHtml(displayId)} shipped and email the customer the tracking link?`,
    { reply_markup: { inline_keyboard: [[
      { text: '✅ Confirm', callback_data: `shpc:${orderId}:${displayId}` },
      { text: '❌ Cancel', callback_data: 'dis' },
    ]] } }
  )
}

export const shpcAction: CallbackHandler = async (ctx, [orderId, displayId]) => {
  if (!orderId || !displayId) return 'Missing order id'
  // Claim BEFORE executing: dedups a double-tap. Released on every failure so
  // a transient error (email provider down) stays retryable from the phone.
  // markDhlOrderShipped itself is idempotent (shipped_at guard + idempotency-
  // keyed email), so even a lost race is harmless.
  const key = `tg-act-shp-${orderId}`
  const claimed = await ctx.svc.claimAction(key, 'act_ship', ctx.actor, { order_id: orderId, display_id: Number(displayId) })
  if (!claimed) return 'Already handled'

  let r: Awaited<ReturnType<typeof markDhlOrderShipped>>
  try {
    r = await markDhlOrderShipped(ctx.container, orderId)
  } catch (e) {
    // markDhlOrderShipped lets the email send throw (route surfaces it too).
    await ctx.svc.releaseAction(key)
    await editResult(ctx, `❌ Mark shipped failed: ${escapeHtml((e as Error).message)}`)
    return 'Failed'
  }

  if (r.ok) {
    await editResult(ctx, `🚚 <b>Shipped #${escapeHtml(displayId)}</b> | customer emailed${r.already_shipped ? ' (was already marked shipped)' : ''}`)
    return 'Shipped + emailed'
  }
  await ctx.svc.releaseAction(key)
  if (r.reason === 'no_dhl_label') {
    await editResult(ctx, '❌ No DHL label with tracking found for this order.')
    return 'No label'
  }
  return 'Order not found'
}
