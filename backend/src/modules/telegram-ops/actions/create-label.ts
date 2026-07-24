import { createDhlLabelForOrder, type CreateLabelResult, type ItemsOverride } from '../../../lib/dhl-label'
import { escapeHtml } from '../format'
import { loadChecklistView } from '../commands/checklist-data'
import { CONFIRM_PREFIX, stripConfirm, type CallbackCtx, type CallbackHandler } from '../commands/callbacks'

async function editResult(ctx: CallbackCtx, statusHtml: string): Promise<void> {
  await ctx.svc.editMessage(ctx.chatId, ctx.messageId, `${escapeHtml(stripConfirm(ctx.originalText))}\n\n${statusHtml}`)
}

// Safety net for override-created labels: nobody verified the picks, so the
// success message must say so and name what still needs a manual check.
async function pickSkippedWarning(ctx: CallbackCtx, orderId: string): Promise<string> {
  let itemLines = ''
  try {
    const view = await loadChecklistView(ctx.container, orderId)
    itemLines = (view?.items ?? [])
      .filter((i) => !i.ticked)
      .map((i) => `\n• ${i.qty}x ${escapeHtml(i.title)}`)
      .join('')
  } catch {
    // Best effort: the warning still shows without the item list.
  }
  const base = '⚠️ <b>Pick check skipped (override).</b> Verify the package contents before sealing'
  return itemLines ? `\n\n${base}:${itemLines}` : `\n\n${base}.`
}

async function runCreateLabel(ctx: CallbackCtx, orderId: string, itemsOverride?: ItemsOverride): Promise<string | void> {
  const r: CreateLabelResult = await createDhlLabelForOrder(ctx.container, orderId, itemsOverride ? { itemsOverride } : {})
  switch (r.status) {
    case 'created': {
      // Audit row. Label creation itself is idempotent downstream (duplicate
      // guard + uuidv5 labelId), so the audit is claim-after, keyed by the
      // (unique) fulfillment id.
      await ctx.svc.claimAction(`tg-act-lbl-${r.fulfillment_id}`, 'act_label', ctx.actor, {
        order_id: orderId, display_id: r.display_id, tracking_number: r.tracking_number, override: Boolean(itemsOverride),
      })
      const warning = itemsOverride ? await pickSkippedWarning(ctx, orderId) : ''
      await editResult(ctx, `📦 <b>Label created #${r.display_id}</b>${r.tracking_number ? `\nTracking: ${escapeHtml(r.tracking_number)}` : ''}${warning}`)
      return itemsOverride ? 'Label created, pick check skipped' : 'Label created'
    }
    case 'exists':
      await editResult(ctx, `📦 Label already exists for #${r.display_id}${r.tracking_number ? ` | ${escapeHtml(r.tracking_number)}` : ''}`)
      return 'Label already existed'
    case 'checklist_blocked':
      // The pick gate blocks: offer an explicit, audit-logged override
      // (written to the checklist metadata exactly like the admin widget's).
      await ctx.svc.editMessage(
        ctx.chatId, ctx.messageId,
        `${escapeHtml(stripConfirm(ctx.originalText))}${CONFIRM_PREFIX}Picklist for #${r.display_id} is not completed (${r.ticked}/${r.total} items ticked). Create the label anyway? This records an override on the checklist.`,
        { reply_markup: { inline_keyboard: [[
          { text: '✅ Override + create', callback_data: `lblo:${orderId}` },
          { text: '❌ Cancel', callback_data: 'dis' },
        ]] } }
      )
      return
    case 'not_found':
      return 'Order not found'
    case 'invalid':
      await editResult(ctx, `❌ ${escapeHtml(r.message)}`)
      return 'Label creation failed'
    default:
      await editResult(ctx, `❌ Label creation failed: ${escapeHtml(r.message)}`)
      return 'Label creation failed'
  }
}

export const lblAction: CallbackHandler = async (ctx, [orderId]) => {
  if (!orderId) return 'Missing order id'
  return runCreateLabel(ctx, orderId)
}

export const lbloAction: CallbackHandler = async (ctx, [orderId]) => {
  if (!orderId) return 'Missing order id'
  // Dutch reason: checklist override reasons are Dutch everywhere else in
  // admin. Always >= MIN_OVERRIDE_REASON chars thanks to the fixed prefix.
  return runCreateLabel(ctx, orderId, {
    byId: `tg:${ctx.actor.id}`,
    byName: ctx.actor.name,
    reason: `Label aangemaakt via Telegram-bot door ${ctx.actor.name}`,
  })
}
