import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { escapeHtml } from '../format'
import { MAX_RESTOCK } from '../commands/restock'
import type { CallbackHandler } from '../commands/callbacks'

// rsk:<inventory_item_id> | quantity picker from a low-stock alert (N7/N8).
// Sends a NEW message whose buttons are the standard rst:<id>:<qty> apply
// callbacks, so the actual write path stays single.
export const rskAction: CallbackHandler = async (ctx, [invItemId]) => {
  if (!invItemId) return 'Missing item id'
  const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'inventory_item',
    filters: { id: invItemId },
    fields: ['id', 'sku', 'title', 'location_levels.stocked_quantity', 'location_levels.reserved_quantity'],
  })
  const item = (data ?? [])[0] as { id: string; sku?: string | null; title?: string | null; location_levels?: Array<{ stocked_quantity?: number | string; reserved_quantity?: number | string }> } | undefined
  if (!item) return 'Inventory item not found'
  const stocked = (item.location_levels ?? []).reduce((n, l) => n + Number(l?.stocked_quantity ?? 0), 0)
  const reserved = (item.location_levels ?? []).reduce((n, l) => n + Number(l?.reserved_quantity ?? 0), 0)
  const name = String(item.title || item.sku || item.id)
  await ctx.svc.sendTo(ctx.chatId, `⚠️ Restock <b>${escapeHtml(name)}</b> (now ${stocked - reserved} available). Choose the amount:`, {
    reply_markup: { inline_keyboard: [
      [10, 25, 50].map((n) => ({ text: `✅ +${n}`, callback_data: `rst:${item.id}:${n}` })),
      [{ text: '❌ Cancel', callback_data: 'dis' }],
    ] },
  })
}

// Confirmed positive stock adjustment. The claim key derives from the
// confirm-prompt message (one prompt = one executable action), so a
// double-tap dedups; the claim is released on failure so a transient error
// stays retryable via a fresh /restock.
export const rstAction: CallbackHandler = async (ctx, [invItemId, qtyStr]) => {
  const qty = parseInt(qtyStr ?? '', 10)
  if (!invItemId || !Number.isInteger(qty) || qty < 1 || qty > MAX_RESTOCK) return 'Invalid quantity'

  const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'inventory_item',
    filters: { id: invItemId },
    fields: ['id', 'sku', 'title', 'location_levels.location_id', 'location_levels.stocked_quantity', 'location_levels.reserved_quantity'],
  })
  const item = (data ?? [])[0] as {
    id: string; sku?: string | null; title?: string | null
    location_levels?: Array<{ location_id?: string; stocked_quantity?: number | string; reserved_quantity?: number | string }>
  } | undefined
  const level = item?.location_levels?.[0]
  if (!item || !level?.location_id) return 'Inventory item or stock location not found'
  const name = String(item.title || item.sku || item.id)

  const key = `tg-act-rst-${ctx.chatId}-${ctx.messageId}`
  const claimed = await ctx.svc.claimAction(key, 'act_restock', ctx.actor, { inventory_item_id: item.id, qty, name })
  if (!claimed) return 'Already handled'

  try {
    const inventoryService: any = ctx.container.resolve(Modules.INVENTORY)
    await inventoryService.adjustInventory([
      { inventoryItemId: item.id, locationId: level.location_id, adjustment: qty },
    ])
  } catch (e) {
    await ctx.svc.releaseAction(key)
    await ctx.svc.editMessage(ctx.chatId, ctx.messageId, `❌ Restock failed for ${escapeHtml(name)}: ${escapeHtml((e as Error).message)}`)
    return 'Restock failed'
  }

  const stocked = (item.location_levels ?? []).reduce((n, l) => n + Number(l?.stocked_quantity ?? 0), 0)
  const reserved = (item.location_levels ?? []).reduce((n, l) => n + Number(l?.reserved_quantity ?? 0), 0)
  const available = stocked + qty - reserved
  await ctx.svc.editMessage(
    ctx.chatId, ctx.messageId,
    `✅ Restocked <b>${escapeHtml(name)}</b> +${qty} | now ${available} available (${stocked + qty} stocked, ${reserved} reserved)`
  )
  return 'Stock updated'
}
