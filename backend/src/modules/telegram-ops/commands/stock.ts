import { escapeHtml } from '../format'
import { fetchInventoryRows } from './inventory-data'
import type { CommandHandler } from './router'

export const stockCommand: CommandHandler = async ({ container, args }) => {
  const search = args.join(' ').toLowerCase()
  const rows = (await fetchInventoryRows(container))
    .filter((r) => !search || r.name.toLowerCase().includes(search))
    .sort((a, b) => a.available - b.available)
    .slice(0, 15)
  if (!rows.length) return search ? `No inventory matches "${escapeHtml(search)}".` : 'No inventory items found.'
  const lines = rows.map((r) => {
    const flag = r.available <= 0 ? '🔴 ' : r.available <= 5 ? '🟠 ' : ''
    return `${flag}${escapeHtml(r.name)}: <b>${r.available} available</b> (${r.stocked} stocked, ${r.reserved} reserved)`
  })
  return [`<b>Stock${search ? ` | ${escapeHtml(search)}` : ' | lowest 15'}</b>`, '', ...lines].join('\n')
}
