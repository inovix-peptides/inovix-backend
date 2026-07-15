import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import type { MedusaContainer } from '@medusajs/framework/types'
import type { GlyphInput } from '../format'

export type OrderSummary = {
  raw_current_order_total?: { value?: number | string | null } | null
  current_order_total?: number | string | null
} | null

export type RawOrder = {
  id: string
  display_id: number
  created_at: string
  total: number | string
  currency_code: string
  canceled_at: string | null
  email?: string
  summary?: OrderSummary
  payment_collections?: Array<{ status?: string; captured_amount?: number | string }>
  fulfillments?: Array<{ packed_at?: string | null; shipped_at?: string | null; canceled_at?: string | null; labels?: Array<{ tracking_number?: string; tracking_url?: string }> }>
  shipping_address?: { country_code?: string; city?: string; first_name?: string; last_name?: string }
  items?: Array<{ title?: string; quantity?: number | string; unit_price?: number | string }>
}

export const ORDER_LIST_FIELDS = [
  'id', 'display_id', 'created_at', 'total', 'currency_code', 'canceled_at',
  'summary.*',
  'payment_collections.status', 'payment_collections.captured_amount',
  'fulfillments.packed_at', 'fulfillments.shipped_at', 'fulfillments.canceled_at',
  'shipping_address.country_code',
  'items.quantity',
]

// The order-level `total` field is NOT trustworthy through query.graph on
// live data (it has shown a shipping-only amount; see also commit 3e07a4c:
// unknown fields return undefined silently, bigNumber columns surface as
// raw {value, precision}). The reliable source is the order summary, the
// same one the transactional emails render (order-confirmation-text.ts).
export function orderTotal(o: RawOrder): number {
  const s = o.summary
  const fromSummary = s?.raw_current_order_total?.value ?? s?.current_order_total
  if (fromSummary != null && Number.isFinite(Number(fromSummary))) return Number(fromSummary)
  const captured = Number(o.payment_collections?.[0]?.captured_amount ?? NaN)
  if (Number.isFinite(captured) && captured > 0) return captured
  const t = Number(o.total)
  return Number.isFinite(t) ? t : 0
}

export function deriveStatus(o: RawOrder): GlyphInput {
  const pc = o.payment_collections?.[0]
  const paid = pc?.status === 'completed' || Number(pc?.captured_amount ?? 0) > 0
  // query.graph can return null elements inside relation arrays for orders
  // where the linked row is absent; guard every element access.
  const active = (o.fulfillments ?? []).filter((f) => !!f && !f.canceled_at)
  return {
    paid,
    hasLabel: active.some((f) => f?.packed_at),
    shipped: active.some((f) => f?.shipped_at),
    canceled: Boolean(o.canceled_at),
  }
}

// query.graph pagination shape mirrors src/jobs/alert-unshipped-orders.ts and
// src/api/admin/verzendstation/queue/route.ts: pagination: { take, skip, order }.
export async function fetchRecentOrders(container: MedusaContainer, take: number, fields = ORDER_LIST_FIELDS): Promise<RawOrder[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: 'order',
    fields,
    pagination: { take, skip: 0, order: { created_at: 'DESC' } },
  })
  return (data ?? []) as RawOrder[]
}
