import { escapeHtml } from '../format'
import { fetchInventoryRows } from './inventory-data'
import type { CommandHandler } from './router'

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

  const matches = (await fetchInventoryRows(container)).filter((r) => r.name.toLowerCase().includes(search))
  if (!matches.length) return `No inventory matches "${escapeHtml(search)}".`
  if (matches.length > 1) {
    const names = matches.slice(0, 5).map((r) => `| ${escapeHtml(r.name)}`)
    return [`${matches.length} matches. Narrow the search:`, ...names].join('\n')
  }

  const item = matches[0]
  if (!item.locationId) {
    return `${escapeHtml(item.name)} has no stock location yet. Create one in admin first.`
  }
  return {
    text: `⚠️ Restock <b>${escapeHtml(item.name)}</b>: +${qty} (now ${item.available} available, ${item.stocked} stocked). Confirm?`,
    reply_markup: { inline_keyboard: [[
      { text: `✅ Confirm +${qty}`, callback_data: `rst:${item.id}:${qty}` },
      { text: '❌ Cancel', callback_data: 'dis' },
    ]] },
  }
}
