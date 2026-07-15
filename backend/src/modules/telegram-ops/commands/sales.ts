import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { eur } from '../format'
import { orderTotal } from './order-data'
import type { CommandHandler } from './router'

type Period = 'today' | 'week' | 'month'

/** Amsterdam UTC offset (CET +1h or CEST +2h) at a given instant, in ms. */
function amsOffsetAt(instant: Date): number {
  const ams = new Date(instant.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }))
  const utc = new Date(instant.toLocaleString('en-US', { timeZone: 'UTC' }))
  return ams.getTime() - utc.getTime()
}

/**
 * UTC instant of Amsterdam local midnight on the given calendar date
 * (read from the Date's UTC fields). The offset is derived per boundary
 * date, not reused from `now`, so boundaries that fall in a different
 * DST regime (and DST-transition days themselves) come out correct:
 * guess midnight with the offset at 00:00Z, then re-derive the offset
 * at the guessed instant; one refinement converges for Europe/Amsterdam.
 */
function amsMidnight(calDate: Date): Date {
  const utcMidnight = Date.UTC(calDate.getUTCFullYear(), calDate.getUTCMonth(), calDate.getUTCDate())
  let guess = utcMidnight - amsOffsetAt(new Date(utcMidnight))
  guess = utcMidnight - amsOffsetAt(new Date(guess))
  return new Date(guess)
}

/** Amsterdam-midnight period start + the start of the previous period. */
export function periodBounds(period: Period, now: Date): { start: Date; prevStart: Date } {
  // Get the Amsterdam calendar date of `now`, then do all arithmetic on
  // calendar dates (Date.UTC normalizes over/underflow) and convert each
  // boundary date to its own Amsterdam midnight.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const [y, m, d] = fmt.format(now).split('-').map(Number)
  const cal = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd))

  if (period === 'today') {
    return { start: amsMidnight(cal(y, m, d)), prevStart: amsMidnight(cal(y, m, d - 1)) }
  }
  if (period === 'week') {
    const dow = cal(y, m, d).getUTCDay() || 7 // Mon=1..Sun=7
    const monday = d - (dow - 1)
    return { start: amsMidnight(cal(y, m, monday)), prevStart: amsMidnight(cal(y, m, monday - 7)) }
  }
  return { start: amsMidnight(cal(y, m, 1)), prevStart: amsMidnight(cal(y, m - 1, 1)) }
}

type SalesOrder = {
  created_at: string
  total: number | string
  canceled_at: string | null
  summary?: import('./order-data').OrderSummary
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
    fields: ['created_at', 'total', 'canceled_at', 'summary.*', 'payment_collections.status', 'payment_collections.captured_amount'],
    pagination: { take: SALES_SCAN_TAKE, skip: 0, order: { created_at: 'DESC' } },
  })
  const orders = ((data ?? []) as SalesOrder[])
    .filter((o) => !!o && new Date(o.created_at) >= prevStart)
    .filter((o) => !o.canceled_at && isPaid(o))
  const inPeriod = orders.filter((o) => new Date(o.created_at) >= start)
  const inPrev = orders.filter((o) => new Date(o.created_at) < start)
  // orderTotal: order-level `total` is unreliable via query.graph on live
  // data; the summary is the source of truth (see order-data.ts).
  const sum = (xs: SalesOrder[]) => xs.reduce((n, o) => n + orderTotal(o as never), 0)
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
