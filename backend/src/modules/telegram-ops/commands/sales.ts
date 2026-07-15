import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { eur } from '../format'
import type { CommandHandler } from './router'

type Period = 'today' | 'week' | 'month'

/** Amsterdam-midnight period start + the start of the previous period. */
export function periodBounds(period: Period, now: Date): { start: Date; prevStart: Date } {
  // Get the Amsterdam calendar date of `now`, then rebuild midnight in UTC.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const [y, m, d] = fmt.format(now).split('-').map(Number)
  // Amsterdam offset at `now` (CET +1 or CEST +2), derived by comparing zones.
  const utcMidnight = Date.UTC(y, m - 1, d)
  const amsAtUtcMidnight = new Date(new Date(utcMidnight).toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }))
  const utcAtUtcMidnight = new Date(new Date(utcMidnight).toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMs = amsAtUtcMidnight.getTime() - utcAtUtcMidnight.getTime()
  const dayStart = new Date(utcMidnight - offsetMs)

  const DAY = 24 * 3600 * 1000
  if (period === 'today') return { start: dayStart, prevStart: new Date(dayStart.getTime() - DAY) }
  if (period === 'week') {
    const dow = new Date(dayStart.getTime() + offsetMs).getUTCDay() || 7 // Mon=1..Sun=7
    const weekStart = new Date(dayStart.getTime() - (dow - 1) * DAY)
    return { start: weekStart, prevStart: new Date(weekStart.getTime() - 7 * DAY) }
  }
  const monthStart = new Date(Date.UTC(y, m - 1, 1) - offsetMs)
  const prevMonthStart = new Date(Date.UTC(y, m - 2, 1) - offsetMs)
  return { start: monthStart, prevStart: prevMonthStart }
}

type SalesOrder = {
  created_at: string
  total: number | string
  canceled_at: string | null
  payment_collections?: Array<{ status?: string; captured_amount?: number | string }>
}

const isPaid = (o: SalesOrder) => {
  const pc = o.payment_collections?.[0]
  return pc?.status === 'completed' || Number(pc?.captured_amount ?? 0) > 0
}

// NOTE (deviation from the Task 6 brief): the brief's snippet used
// `filters: { created_at: { $gte: prevStart.toISOString() } }` on query.graph.
// There is no precedent anywhere in this codebase for a comparison-operator
// filter ($gte/$lte/$gt/$lt) on query.graph; a repo-wide grep found none.
// The two files the plan explicitly pointed at for the filter form
// (src/jobs/alert-unshipped-orders.ts, src/api/admin/verzendstation/queue/route.ts)
// both instead fetch a bounded, sorted page via `pagination: { take, skip, order }`
// (same shape as order-data.ts's fetchRecentOrders) and do all date/staleness
// filtering in memory afterward. We mirror that verified-safe pattern here
// instead of introducing an unproven operator.
const SALES_SCAN_TAKE = 1000

export const salesCommand: CommandHandler = async ({ container, args }) => {
  const period = (['today', 'week', 'month'].includes(args[0]) ? args[0] : 'today') as Period
  const { start, prevStart } = periodBounds(period, new Date())
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'order',
    fields: ['created_at', 'total', 'canceled_at', 'payment_collections.status', 'payment_collections.captured_amount'],
    pagination: { take: SALES_SCAN_TAKE, skip: 0, order: { created_at: 'DESC' } },
  })
  const orders = ((data ?? []) as SalesOrder[])
    .filter((o) => new Date(o.created_at) >= prevStart)
    .filter((o) => !o.canceled_at && isPaid(o))
  const inPeriod = orders.filter((o) => new Date(o.created_at) >= start)
  const inPrev = orders.filter((o) => new Date(o.created_at) < start)
  const sum = (xs: SalesOrder[]) => xs.reduce((n, o) => n + Number(o.total ?? 0), 0)
  const cur = sum(inPeriod)
  const prev = sum(inPrev)
  const delta = prev > 0 ? ` (${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 100)}% vs previous ${period})` : ''
  const label = { today: 'Today', week: 'This week', month: 'This month' }[period]
  return [
    `📈 <b>${label}</b>`,
    `${eur(cur)} | ${inPeriod.length} order${inPeriod.length === 1 ? '' : 's'}${delta}`,
    `Previous ${period}: ${eur(prev)} | ${inPrev.length} orders`,
  ].join('\n')
}
