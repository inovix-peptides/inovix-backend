import { Modules } from '@medusajs/framework/utils'
import { escapeHtml } from '../format'
import { MAX_RESTOCK } from '../commands/restock'
import { fetchInventoryRow } from '../commands/inventory-data'
import type { CallbackHandler } from '../commands/callbacks'

// rsk:<inventory_item_id> | quantity picker from a low-stock alert (N7/N8).
// The picker buttons go to rsp (a confirm prompt), NEVER straight to rst:
// a single mistap on an alert must not change stock.
export const rskAction: CallbackHandler = async (ctx, [invItemId]) => {
  if (!invItemId) return 'Missing item id'
  const item = await fetchInventoryRow(ctx.container, invItemId)
  if (!item) return 'Inventory item not found'
  await ctx.svc.sendTo(ctx.chatId, `Restock <b>${escapeHtml(item.name)}</b> (now ${item.available} available). Choose the amount:`, {
    reply_markup: { inline_keyboard: [
      [10, 25, 50].map((n) => ({ text: `+${n}`, callback_data: `rsp:${item.id}:${n}` })),
      [{ text: '❌ Cancel', callback_data: 'dis' }],
    ] },
  })
}

// rsp:<inventory_item_id>:<qty> | the explicit confirm step between the
// picker and the write (same prompt /restock produces).
export const rspAction: CallbackHandler = async (ctx, [invItemId, qtyStr]) => {
  const qty = parseInt(qtyStr ?? '', 10)
  if (!invItemId || !Number.isInteger(qty) || qty < 1 || qty > MAX_RESTOCK) return 'Invalid quantity'
  const item = await fetchInventoryRow(ctx.container, invItemId)
  if (!item) return 'Inventory item not found'
  if (!item.locationId) return 'No stock location; create one in admin first'
  await ctx.svc.editMessage(
    ctx.chatId, ctx.messageId,
    `⚠️ Restock <b>${escapeHtml(item.name)}</b>: +${qty} (now ${item.available} available, ${item.stocked} stocked). Confirm?`,
    { reply_markup: { inline_keyboard: [[
      { text: `✅ Confirm +${qty}`, callback_data: `rst:${item.id}:${qty}` },
      { text: '❌ Cancel', callback_data: 'dis' },
    ]] } }
  )
}

// rst:<inventory_item_id>:<qty> | the confirmed positive stock adjustment.
// ONLY ever reachable from an explicit Confirm button (/restock prompt or
// rsp). The claim key derives from the confirm-prompt message (one prompt =
// one executable action), so a double-tap dedups; the claim is released on
// failure so a transient error stays retryable via a fresh /restock.
export const rstAction: CallbackHandler = async (ctx, [invItemId, qtyStr]) => {
  const qty = parseInt(qtyStr ?? '', 10)
  if (!invItemId || !Number.isInteger(qty) || qty < 1 || qty > MAX_RESTOCK) return 'Invalid quantity'

  const item = await fetchInventoryRow(ctx.container, invItemId)
  if (!item || !item.locationId) return 'Inventory item or stock location not found'

  const key = `tg-act-rst-${ctx.chatId}-${ctx.messageId}`
  const claimed = await ctx.svc.claimAction(key, 'act_restock', ctx.actor, { inventory_item_id: item.id, qty, name: item.name })
  if (!claimed) return 'Already handled'

  try {
    const inventoryService: any = ctx.container.resolve(Modules.INVENTORY)
    await inventoryService.adjustInventory([
      { inventoryItemId: item.id, locationId: item.locationId, adjustment: qty },
    ])
  } catch (e) {
    await ctx.svc.releaseAction(key)
    await ctx.svc.editMessage(ctx.chatId, ctx.messageId, `❌ Restock failed for ${escapeHtml(item.name)}: ${escapeHtml((e as Error).message)}`)
    return 'Restock failed'
  }

  const available = item.available + qty
  await ctx.svc.editMessage(
    ctx.chatId, ctx.messageId,
    `✅ Restocked <b>${escapeHtml(item.name)}</b> +${qty} | now ${available} available (${item.stocked + qty} stocked, ${item.reserved} reserved)`
  )
  return 'Stock updated'
}
