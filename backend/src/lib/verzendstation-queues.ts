// Pure derivation of the Verzendstation queues from order rows loaded via
// query.graph. query.graph cannot compute fulfillment_status, so paid /
// packed / shipped are derived here from the broker payment amounts and the
// fulfillment timestamps. Shared by the queue API route and the daily
// unshipped-orders alert job.

import { evaluatePaymentGate } from "../admin/widgets/order-fulfillment-checklist.logic"

const BROKER_PROVIDER_ID = "pp_via_broker_via_broker"

// The exact field list callers must pass to query.graph (entity: "order").
// Trailing-star rules apply; shipping_option is never traversed.
export const QUEUE_ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "created_at",
  "email",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "items.id",
  "items.quantity",
  "fulfillments.id",
  "fulfillments.packed_at",
  "fulfillments.shipped_at",
  "fulfillments.canceled_at",
  "payment_collections.payments.provider_id",
  "payment_collections.payments.amount",
  "payment_collections.payments.captured_amount",
  "payment_collections.payments.refunded_amount",
  "payment_collections.payments.canceled_at",
]

export type QueueOrderRow = {
  id: string
  display_id?: number | null
  status?: string | null
  created_at?: string | Date | null
  email?: string | null
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
  } | null
  items?: Array<{ id: string; quantity?: unknown }> | null
  fulfillments?: Array<{
    id: string
    packed_at?: string | Date | null
    shipped_at?: string | Date | null
    canceled_at?: string | Date | null
  }> | null
  payment_collections?: Array<{
    payments?: Array<{
      provider_id?: string | null
      amount?: unknown
      captured_amount?: unknown
      refunded_amount?: unknown
      canceled_at?: string | Date | null
    }> | null
  }> | null
}

export type QueueEntry = {
  id: string
  display_id: number | null
  customer_name: string
  item_count: number
  created_at: string | null
  packed_at: string | null
}

export type VerzendstationQueues = {
  to_process: QueueEntry[]
  to_ship: QueueEntry[]
}

function iso(v: string | Date | null | undefined): string | null {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : String(v)
}

function toEntry(row: QueueOrderRow, packedAt: string | null): QueueEntry {
  const a = row.shipping_address ?? {}
  return {
    id: row.id,
    display_id: row.display_id ?? null,
    customer_name:
      `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || (row.email ?? ""),
    item_count: (row.items ?? []).reduce((n, i) => n + Number(i.quantity ?? 0), 0),
    created_at: iso(row.created_at),
    packed_at: packedAt,
  }
}

export function buildVerzendstationQueues(rows: QueueOrderRow[]): VerzendstationQueues {
  const to_process: QueueEntry[] = []
  const to_ship: QueueEntry[] = []

  for (const row of rows) {
    if (row.status === "canceled" || row.status === "draft" || row.status === "archived") {
      continue
    }
    // Prefer a non-canceled fulfillment that still needs action (not shipped);
    // an order with a shipped fulfillment AND a fresh redo must not be hidden
    // behind the shipped one.
    const nonCanceled = (row.fulfillments ?? []).filter((f) => !f.canceled_at)
    const active = nonCanceled.find((f) => !f.shipped_at) ?? nonCanceled[0]
    if (active?.shipped_at) continue
    if (active?.packed_at) {
      to_ship.push(toEntry(row, iso(active.packed_at)))
      continue
    }
    if (active) continue // fulfillment exists but not packed yet: mid-flight, skip

    const payment = (row.payment_collections ?? [])
      .flatMap((c) => c.payments ?? [])
      .find((p) => p?.provider_id === BROKER_PROVIDER_ID)
    if (!evaluatePaymentGate((payment as never) ?? null).ok) continue
    to_process.push(toEntry(row, null))
  }

  // Oldest first: the longest-waiting order is the most urgent.
  to_process.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
  to_ship.sort((a, b) => (a.packed_at ?? "").localeCompare(b.packed_at ?? ""))
  return { to_process, to_ship }
}

// The to_ship entries whose packed_at is older than maxAgeMs. Used by the
// daily alert job ("ingepakt maar nooit verzonden").
export function selectStaleUnshipped(
  queues: VerzendstationQueues,
  nowMs: number,
  maxAgeMs: number
): QueueEntry[] {
  return queues.to_ship.filter((e) => {
    const t = e.packed_at ? new Date(e.packed_at).getTime() : NaN
    return Number.isFinite(t) && nowMs - t >= maxAgeMs
  })
}
