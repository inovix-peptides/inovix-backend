import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { escapeHtml, eur } from '../format'
import { firstNumber, itemQuantity } from './order-data'
import { periodBounds } from './sales'
import type { CommandHandler } from './router'

export type TopOrder = {
  created_at: string
  canceled_at: string | null
  payment_collections?: Array<{ status?: string; captured_amount?: number | string }>
  items?: Array<{
    title?: string | null
    quantity?: unknown
    raw_quantity?: unknown
    unit_price?: unknown
    raw_unit_price?: unknown
    detail?: { quantity?: unknown; raw_quantity?: unknown } | null
  } | null> | null
}

export type TopRow = { title: string; qty: number; revenue: number }

// Quantity + revenue per item title, best sellers first. Null items guarded
// (live query.graph returns null relation elements).
export function aggregateTopItems(orders: TopOrder[]): TopRow[] {
  const byTitle = new Map<string, TopRow>()
  for (const o of orders) {
    for (const item of o.items ?? []) {
      if (!item) continue
      const title = String(item.title ?? '?')
      const qty = itemQuantity(item as never) ?? 0
      const price = firstNumber(item.unit_price, item.raw_unit_price) ?? 0
      const row = byTitle.get(title) ?? { title, qty: 0, revenue: 0 }
      row.qty += qty
      row.revenue += qty * price
      byTitle.set(title, row)
    }
  }
  return [...byTitle.values()].sort((a, b) => b.qty - a.qty)
}

const SCAN_TAKE = 1000

const isPaid = (o: TopOrder) => {
  const pc = o.payment_collections?.[0]
  return pc?.status === 'completed' || Number(pc?.captured_amount ?? 0) > 0
}

export const topCommand: CommandHandler = async ({ container, args }) => {
  const period = (['week', 'month'].includes(args[0]) ? args[0] : 'week') as 'week' | 'month'
  const { start } = periodBounds(period, new Date())
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'order',
    fields: [
      'created_at', 'canceled_at',
      'payment_collections.status', 'payment_collections.captured_amount',
      'items.title', 'items.quantity', 'items.raw_quantity',
      'items.detail.quantity', 'items.detail.raw_quantity',
      'items.unit_price', 'items.raw_unit_price',
    ],
    pagination: { take: SCAN_TAKE, skip: 0, order: { created_at: 'DESC' } },
  })
  const orders = ((data ?? []) as Array<TopOrder | null>)
    .filter(Boolean)
    .map((o) => o as TopOrder)
    .filter((o) => !o.canceled_at && isPaid(o) && new Date(o.created_at) >= start)

  const rows = aggregateTopItems(orders).slice(0, 10)
  if (!rows.length) return `No sales this ${period} yet.`
  const label = period === 'week' ? 'this week' : 'this month'
  return [
    `🏆 <b>Top products ${label}</b>`,
    '',
    ...rows.map((r, i) => `${i + 1}. ${escapeHtml(r.title)} | ${r.qty}x | ${eur(r.revenue)}`),
  ].join('\n')
}
