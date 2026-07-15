// Pure logic for the order-payment-broker admin widget and its API routes.
// Lives in its own file so we can unit-test it without booting the admin
// runtime / React / Medusa UI imports. No I/O here | callers pass in the
// already-fetched Medusa payment record and the (optional) live broker status.

// A Medusa BigNumber value can surface as a number, a string, a { numeric }
// wrapper, or the raw { value, precision } shape (what a direct query.graph
// returns for bigNumber columns) depending on where in the stack it was
// serialised.
export type AmountLike =
  | number
  | string
  | { numeric?: number | string | null }
  | { value?: number | string | null; precision?: number | null }
  | null
  | undefined

export type RawRefund = {
  id?: string | null
  amount?: AmountLike
  created_at?: string | Date | null
  note?: string | null
  refund_reason?: { label?: string | null } | null
}

export type RawCapture = {
  id?: string | null
  amount?: AmountLike
  created_at?: string | Date | null
}

export type RawMedusaPayment = {
  id: string
  provider_id?: string | null
  currency_code?: string | null
  amount?: AmountLike
  raw_amount?: AmountLike
  captured_amount?: AmountLike
  refunded_amount?: AmountLike
  created_at?: string | Date | null
  captured_at?: string | Date | null
  canceled_at?: string | Date | null
  data?: { ref?: string | null } | null
  captures?: RawCapture[] | null
  refunds?: RawRefund[] | null
}

// What the broker GET tells us live. Null means the broker was unreachable.
// method/paid_at/mollie_status are enrichment fields the broker passes
// through from a read-only Mollie lookup; older broker versions omit them.
export type BrokerLive = {
  status: string
  mollie_payment_id: string | null
  captured_at: string | null
  method?: string | null
  paid_at?: string | null
  mollie_status?: string | null
} | null

export type RefundView = {
  id: string
  amount: number
  created_at: string
  reason: string | null
}

export type PaymentEventType = "created" | "captured" | "refunded" | "canceled"

export type PaymentEvent = {
  type: PaymentEventType
  at: string
  amount: number | null
  note: string | null
}

export type PaymentView = {
  ref: string | null
  status: string
  mollie_payment_id: string | null
  captured_at: string | null
  method: string | null
  mollie_status: string | null
  created_at: string | null
  currency: string
  amount: number
  captured_total: number
  refunded_total: number
  remaining_refundable: number
  refunds: RefundView[]
  history: PaymentEvent[]
  broker_unavailable: boolean
}

export function toAmount(value: AmountLike): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (value && typeof value === "object") {
    if ("numeric" in value) {
      return toAmount((value as { numeric?: number | string | null }).numeric ?? 0)
    }
    if ("value" in value) {
      return toAmount((value as { value?: number | string | null }).value ?? 0)
    }
  }
  return 0
}

// query.graph has NO captured_amount/refunded_amount fields on payment (they
// exist on payment_collection only; unknown fields come back undefined, not
// as an error). The real sources are the capture and refund rows. This
// normalizes a payment loaded with `captures.amount` + `refunds.amount` so
// every consumer (payment view, DHL payment gate, Verzendstation queue) sees
// plain-number amounts regardless of how BigNumber columns were serialized.
export function normalizeBrokerPayment<T extends RawMedusaPayment>(payment: T): T {
  const capturedFromRows = (payment.captures ?? []).reduce(
    (sum, c) => sum + toAmount(c.amount),
    0
  )
  const refundedFromRows = (payment.refunds ?? []).reduce(
    (sum, r) => sum + toAmount(r.amount),
    0
  )
  return {
    ...payment,
    amount: toAmount(payment.amount) || toAmount(payment.raw_amount),
    captured_amount: Math.max(capturedFromRows, toAmount(payment.captured_amount)),
    refunded_amount: Math.max(refundedFromRows, toAmount(payment.refunded_amount)),
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function computeRemainingRefundable(
  capturedTotal: number,
  refundedTotal: number
): number {
  return round2(Math.max(0, capturedTotal - refundedTotal))
}

export function validateRefundAmount(
  amount: number,
  remainingRefundable: number
): { ok: boolean; error?: string } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Bedrag moet groter dan 0 zijn." }
  }
  if (remainingRefundable <= 0) {
    return { ok: false, error: "Er is niets meer om terug te betalen." }
  }
  // Allow a sub-cent overshoot so a UI default of "exactly the remaining
  // amount" never trips on float representation.
  if (amount > remainingRefundable + 0.005) {
    return {
      ok: false,
      error: `Bedrag mag niet meer zijn dan het resterende bedrag (${remainingRefundable}).`,
    }
  }
  return { ok: true }
}

function deriveStatusFromMedusa(
  payment: RawMedusaPayment,
  capturedTotal: number,
  refundedTotal: number
): string {
  if (payment.canceled_at) return "canceled"
  if (capturedTotal > 0 && refundedTotal >= capturedTotal) return "refunded"
  if (payment.captured_at || capturedTotal > 0) return "captured"
  return "pending"
}

function refundCreatedAtMs(r: RefundView): number {
  const t = new Date(r.created_at).getTime()
  return Number.isFinite(t) ? t : 0
}

function isoOrNull(v: string | Date | null | undefined): string | null {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : v
}

function eventAtMs(e: PaymentEvent): number {
  const t = new Date(e.at).getTime()
  return Number.isFinite(t) ? t : 0
}

// The payment's life as a newest-first timeline: created -> captures ->
// refunds (-> canceled). Built from the Medusa rows, which are written the
// moment each event happens, so this is the authoritative history.
function buildHistory(
  payment: RawMedusaPayment,
  amount: number,
  refunds: RefundView[]
): PaymentEvent[] {
  const events: PaymentEvent[] = []
  const createdAt = isoOrNull(payment.created_at)
  if (createdAt) {
    events.push({ type: "created", at: createdAt, amount, note: null })
  }
  for (const capture of payment.captures ?? []) {
    const at = isoOrNull(capture.created_at)
    if (!at) continue
    events.push({
      type: "captured",
      at,
      amount: round2(toAmount(capture.amount)),
      note: null,
    })
  }
  for (const refund of refunds) {
    if (!refund.created_at) continue
    events.push({
      type: "refunded",
      at: refund.created_at,
      amount: refund.amount,
      note: refund.reason,
    })
  }
  const canceledAt = isoOrNull(payment.canceled_at)
  if (canceledAt) {
    events.push({ type: "canceled", at: canceledAt, amount: null, note: null })
  }
  events.sort((a, b) => eventAtMs(b) - eventAtMs(a))
  return events
}

export function buildPaymentView(
  payment: RawMedusaPayment,
  broker: BrokerLive
): PaymentView {
  const capturedTotal = round2(toAmount(payment.captured_amount))
  const refundedTotal = round2(toAmount(payment.refunded_amount))
  const amount = round2(toAmount(payment.amount))
  const refunds: RefundView[] = (payment.refunds ?? []).map((r) => ({
    id: r.id ?? "",
    amount: round2(toAmount(r.amount)),
    created_at: isoOrNull(r.created_at) ?? "",
    reason: r.refund_reason?.label ?? null,
  }))
  refunds.sort((a, b) => refundCreatedAtMs(b) - refundCreatedAtMs(a))

  const capturedAt = isoOrNull(payment.captured_at)

  return {
    ref: payment.data?.ref ?? null,
    status:
      broker?.status ??
      deriveStatusFromMedusa(payment, capturedTotal, refundedTotal),
    mollie_payment_id: broker?.mollie_payment_id ?? null,
    captured_at: broker?.paid_at ?? broker?.captured_at ?? capturedAt,
    method: broker?.method ?? null,
    mollie_status: broker?.mollie_status ?? null,
    created_at: isoOrNull(payment.created_at),
    currency: (payment.currency_code ?? "").toUpperCase(),
    amount,
    captured_total: capturedTotal,
    refunded_total: refundedTotal,
    remaining_refundable: computeRemainingRefundable(capturedTotal, refundedTotal),
    refunds,
    history: buildHistory(payment, amount, refunds),
    broker_unavailable: broker === null,
  }
}
