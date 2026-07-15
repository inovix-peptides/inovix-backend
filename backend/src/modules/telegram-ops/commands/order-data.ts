import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import type { MedusaContainer } from '@medusajs/framework/types'
import type { GlyphInput } from '../format'

export type RawOrder = {
  id: string
  display_id: number
  created_at: string
  total: number | string
  currency_code: string
  canceled_at: string | null
  email?: string
  payment_collections?: Array<{ status?: string; captured_amount?: number | string }>
  fulfillments?: Array<{ packed_at?: string | null; shipped_at?: string | null; canceled_at?: string | null; labels?: Array<{ tracking_number?: string; tracking_url?: string }> }>
  shipping_address?: { country_code?: string; city?: string; first_name?: string; last_name?: string }
  items?: Array<{ title?: string; quantity?: number | string; unit_price?: number | string }>
}

export const ORDER_LIST_FIELDS = [
  'id', 'display_id', 'created_at', 'total', 'currency_code', 'canceled_at',
  'payment_collections.status', 'payment_collections.captured_amount',
  'fulfillments.packed_at', 'fulfillments.shipped_at', 'fulfillments.canceled_at',
  'shipping_address.country_code',
  'items.quantity',
]

export function deriveStatus(o: RawOrder): GlyphInput {
  const pc = o.payment_collections?.[0]
  const paid = pc?.status === 'completed' || Number(pc?.captured_amount ?? 0) > 0
  const active = (o.fulfillments ?? []).filter((f) => !f.canceled_at)
  return {
    paid,
    hasLabel: active.some((f) => f.packed_at),
    shipped: active.some((f) => f.shipped_at),
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
