import { applyChecklistUpdate } from '../../../lib/fulfillment-checklist-write'
import { loadChecklistView, renderChecklist } from '../commands/checklist-data'
import type { CallbackCtx, CallbackHandler } from '../commands/callbacks'

function botActor(ctx: CallbackCtx): { by_id: string; by_name: string } {
  return { by_id: `tg:${ctx.actor.id}`, by_name: ctx.actor.name }
}

async function rerender(ctx: CallbackCtx, orderId: string): Promise<void> {
  const after = await loadChecklistView(ctx.container, orderId)
  if (!after) return
  const r = renderChecklist(after)
  await ctx.svc.editMessage(ctx.chatId, ctx.messageId, r.text, r.reply_markup ? { reply_markup: r.reply_markup } : {})
}

// chk:<order_id> | show the checklist as a NEW message (the phone
// verzendstation for one order). tck/cls edit that message in place.
export const chkAction: CallbackHandler = async (ctx, [orderId]) => {
  if (!orderId) return 'Missing order id'
  const view = await loadChecklistView(ctx.container, orderId)
  if (!view) return 'Order not found'
  const r = renderChecklist(view)
  await ctx.svc.sendTo(ctx.chatId, r.text, r.reply_markup ? { reply_markup: r.reply_markup } : {})
}

// tck:<order_id>:<idx> | toggle one pick item. The index addresses the
// id-sorted item list (item ids exceed the 64-byte callback budget); the
// view is re-loaded at tap time so the mapping is deterministic.
export const tckAction: CallbackHandler = async (ctx, [orderId, idxStr]) => {
  const idx = parseInt(idxStr ?? '', 10)
  if (!orderId || !Number.isInteger(idx) || idx < 0) return 'Invalid item'
  const view = await loadChecklistView(ctx.container, orderId)
  if (!view) return 'Order not found'
  const item = view.items[idx]
  if (!item) return 'Order changed, reopen the checklist'

  const result = await applyChecklistUpdate(
    ctx.container,
    orderId,
    { action: 'tick_item', item_id: item.id, checked: !item.ticked },
    botActor(ctx)
  )
  if ('error' in result) return result.error

  await rerender(ctx, orderId)
}

// cls:<order_id> | toggle package_closed.
export const clsAction: CallbackHandler = async (ctx, [orderId]) => {
  if (!orderId) return 'Missing order id'
  const view = await loadChecklistView(ctx.container, orderId)
  if (!view) return 'Order not found'

  const result = await applyChecklistUpdate(
    ctx.container,
    orderId,
    { action: 'package_closed', checked: !view.packageClosed },
    botActor(ctx)
  )
  if ('error' in result) return result.error

  await rerender(ctx, orderId)
}
