import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import type { MedusaContainer } from '@medusajs/framework/types'
import {
  buildVerzendstationQueues,
  QUEUE_ORDER_FIELDS,
  type QueueOrderRow,
} from '../../../lib/verzendstation-queues'
import { escapeHtml, eur, whenAms } from '../format'
import { orderTotal, type RawOrder } from './order-data'
import { periodBounds } from './sales'
import { aggregateTopItems, type TopOrder } from './top'
import { fetchInventoryRows } from './inventory-data'
import { fetchUmamiStats } from './umami'

export function lowStockThreshold(): number {
  const n = parseInt(process.env.OPS_LOW_STOCK_THRESHOLD ?? '', 10)
  return Number.isInteger(n) && n > 0 ? n : 5
}

const SCAN_TAKE = 1000

type ScanOrder = RawOrder & QueueOrderRow & TopOrder & { created_at: string }

const isPaid = (o: ScanOrder) => {
  const pc = (o as RawOrder).payment_collections?.[0]
  return pc?.status === 'completed' || Number(pc?.captured_amount ?? 0) > 0
}

// One scan feeding revenue + queues (pagination scan, in-memory date filter |
// see the sales.ts NOTE: no comparison-operator filters on query.graph).
async function scanOrders(container: MedusaContainer): Promise<ScanOrder[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'order',
    fields: [
      ...QUEUE_ORDER_FIELDS,
      'canceled_at', 'summary.*', 'total', 'currency_code',
      'payment_collections.status', 'payment_collections.captured_amount',
      'items.title', 'items.raw_quantity', 'items.detail.quantity', 'items.detail.raw_quantity',
      'items.unit_price', 'items.raw_unit_price',
    ],
    pagination: { take: SCAN_TAKE, skip: 0, order: { created_at: 'DESC' } },
  })
  return ((data ?? []) as Array<ScanOrder | null>).filter(Boolean) as ScanOrder[]
}

type LowStockLine = { name: string; available: number }

async function lowStockLines(container: MedusaContainer): Promise<LowStockLine[]> {
  const threshold = lowStockThreshold()
  // Human product names via the shared inventory helper (inventory titles on
  // live data are the packaging: "Vial", "Bottle").
  const rows = await fetchInventoryRows(container)
  return rows
    .map((r) => ({ name: r.name, available: r.available }))
    .filter((r) => r.available <= threshold)
    .sort((a, b) => a.available - b.available)
}

// Visitor line for the digests: real Umami numbers when configured, a plain
// n/a otherwise (fetchUmamiStats already swallows every failure into null).
async function visitorsLine(period: 'today' | 'week', now: Date): Promise<string> {
  const { start } = periodBounds(period, now)
  const stats = await fetchUmamiStats({ startAt: start.getTime(), endAt: now.getTime() })
  return stats ? `Visitors: ${stats.visitors} | ${stats.pageviews} pageviews` : 'Visitors: n/a'
}

// N16 content. Degrades line by line (visitors fall back to n/a); never throws
// partial content into the caller | callers wrap in try/catch anyway.
export async function buildDigest(container: MedusaContainer, now: Date): Promise<string> {
  const [orders, lowStock, visitors] = await Promise.all([
    scanOrders(container),
    lowStockLines(container),
    visitorsLine('today', now),
  ])
  const { start } = periodBounds('today', now)
  const active = orders.filter((o) => !o.canceled_at && isPaid(o))
  const today = active.filter((o) => new Date(o.created_at) >= start)
  const revenue = today.reduce((n, o) => n + orderTotal(o as never), 0)
  const queues = buildVerzendstationQueues(orders as QueueOrderRow[])
  return [
    `📊 <b>Daily digest</b> | ${whenAms(now)}`,
    `Revenue today: ${eur(revenue)} | ${today.length} order${today.length === 1 ? '' : 's'}`,
    `📦 To process: ${queues.to_process.length} | 🚚 To ship: ${queues.to_ship.length}`,
    ...(lowStock.length
      ? [`⚠️ Low stock: ${lowStock.map((l) => `${escapeHtml(l.name)} (${l.available})`).join(', ')}`]
      : ['Stock: all above threshold']),
    visitors,
  ].join('\n')
}

// N17 content: this week vs last week + top products of the week.
export async function buildWeekly(container: MedusaContainer, now: Date): Promise<string> {
  const [orders, visitors] = await Promise.all([scanOrders(container), visitorsLine('week', now)])
  const { start, prevStart } = periodBounds('week', now)
  const active = orders.filter((o) => !o.canceled_at && isPaid(o))
  const thisWeek = active.filter((o) => new Date(o.created_at) >= start)
  const lastWeek = active.filter((o) => new Date(o.created_at) >= prevStart && new Date(o.created_at) < start)
  const cur = thisWeek.reduce((n, o) => n + orderTotal(o as never), 0)
  const prev = lastWeek.reduce((n, o) => n + orderTotal(o as never), 0)
  const delta = prev > 0 ? ` (${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 100)}% vs last week)` : ''
  const top = aggregateTopItems(thisWeek as never).slice(0, 5)
  return [
    `📈 <b>Weekly summary</b> | ${whenAms(now)}`,
    `This week: ${eur(cur)} | ${thisWeek.length} order${thisWeek.length === 1 ? '' : 's'}${delta}`,
    `Last week: ${eur(prev)} | ${lastWeek.length} orders`,
    ...(top.length ? ['', '<b>Top products</b>', ...top.map((t, i) => `${i + 1}. ${escapeHtml(t.title)} | ${t.qty}x | ${eur(t.revenue)}`)] : []),
    '',
    visitors,
  ].join('\n')
}
