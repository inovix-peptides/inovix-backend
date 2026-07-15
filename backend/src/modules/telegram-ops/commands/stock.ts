import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { escapeHtml } from '../format'
import type { CommandHandler } from './router'

type InvItem = {
  id: string
  sku?: string | null
  title?: string | null
  location_levels?: Array<{ stocked_quantity?: number | string; reserved_quantity?: number | string }>
}

export const stockCommand: CommandHandler = async ({ container, args }) => {
  const search = args.join(' ').toLowerCase()
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'inventory_item',
    fields: ['id', 'sku', 'title', 'location_levels.stocked_quantity', 'location_levels.reserved_quantity'],
  })
  const rows = ((data ?? []) as InvItem[])
    .filter((i) => !search || `${i.sku ?? ''} ${i.title ?? ''}`.toLowerCase().includes(search))
    .map((i) => {
      const stocked = (i.location_levels ?? []).reduce((n, l) => n + Number(l.stocked_quantity ?? 0), 0)
      const reserved = (i.location_levels ?? []).reduce((n, l) => n + Number(l.reserved_quantity ?? 0), 0)
      return { name: i.title || i.sku || i.id, stocked, reserved, available: stocked - reserved }
    })
    .sort((a, b) => a.available - b.available)
    .slice(0, 15)
  if (!rows.length) return search ? `No inventory matches "${escapeHtml(search)}".` : 'No inventory items found.'
  const lines = rows.map((r) => {
    const flag = r.available <= 0 ? '🔴 ' : r.available <= 5 ? '🟠 ' : ''
    return `${flag}${escapeHtml(String(r.name))}: <b>${r.available} available</b> (${r.stocked} stocked, ${r.reserved} reserved)`
  })
  return [`<b>Stock${search ? ` | ${escapeHtml(search)}` : ' | lowest 15'}</b>`, '', ...lines].join('\n')
}
