import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { escapeHtml } from '../format'
import type { CommandHandler } from './router'

type InvItem = {
  id: string
  sku?: string | null
  title?: string | null
  location_levels?: Array<{ location_id?: string; stocked_quantity?: number | string; reserved_quantity?: number | string }>
}

export const MAX_RESTOCK = 999

const USAGE = 'Usage: /restock &lt;sku or search&gt; +&lt;n&gt;, e.g. /restock bpc +25 (positive only; reductions happen in admin where you see full context).'

// Positive stock adjustments only, behind a confirm button. The rst:<id>:<n>
// callback (actions/restock.ts) applies the adjustment.
export const restockCommand: CommandHandler = async ({ container, args }) => {
  const qtyArg = args[args.length - 1] ?? ''
  const m = /^\+(\d{1,3})$/.exec(qtyArg)
  const qty = m ? parseInt(m[1], 10) : 0
  const search = args.slice(0, -1).join(' ').toLowerCase().trim()
  if (!m || qty < 1 || qty > MAX_RESTOCK || !search) return USAGE

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'inventory_item',
    fields: ['id', 'sku', 'title', 'location_levels.location_id', 'location_levels.stocked_quantity', 'location_levels.reserved_quantity'],
  })
  const matches = ((data ?? []) as InvItem[]).filter((i) =>
    `${i.sku ?? ''} ${i.title ?? ''}`.toLowerCase().includes(search)
  )
  if (!matches.length) return `No inventory matches "${escapeHtml(search)}".`
  if (matches.length > 1) {
    const names = matches.slice(0, 5).map((i) => `| ${escapeHtml(String(i.title || i.sku || i.id))}`)
    return [`${matches.length} matches. Narrow the search:`, ...names].join('\n')
  }

  const item = matches[0]
  const level = (item.location_levels ?? [])[0]
  if (!level?.location_id) {
    return `${escapeHtml(String(item.title || item.sku || item.id))} has no stock location yet. Create one in admin first.`
  }
  const stocked = (item.location_levels ?? []).reduce((n, l) => n + Number(l?.stocked_quantity ?? 0), 0)
  const reserved = (item.location_levels ?? []).reduce((n, l) => n + Number(l?.reserved_quantity ?? 0), 0)
  const name = String(item.title || item.sku || item.id)
  return {
    text: `⚠️ Restock <b>${escapeHtml(name)}</b>: +${qty} (now ${stocked - reserved} available, ${stocked} stocked). Confirm?`,
    reply_markup: { inline_keyboard: [[
      { text: `✅ Confirm +${qty}`, callback_data: `rst:${item.id}:${qty}` },
      { text: '❌ Cancel', callback_data: 'dis' },
    ]] },
  }
}
