// Pure logic for the order-payment-broker admin widget and its API routes.
// Lives in its own file so we can unit-test it without booting the admin
// runtime / React / Medusa UI imports. No I/O here | callers pass in the
// already-fetched Medusa payment record and the (optional) live broker status.

// A Medusa BigNumber value can surface as a number, a string, or a
// { numeric } wrapper depending on where in the stack it was serialised.
export type AmountLike =
  | number
  | string
  | { numeric?: number | string | null }
  | null
  | undefined

export type RawRefund = {
  id?: string | null
  amount?: AmountLike
  created_at?: string | Date | null
  note?: string | null
  refund_reason?: { label?: string | null } | null
}

export type RawMedusaPayment = {
  id: string
  provider_id?: string | null
  currency_code?: string | null
  amount?: AmountLike
  captured_amount?: AmountLike
  refunded_amount?: AmountLike
  captured_at?: string | Date | null
  canceled_at?: string | Date | null
  data?: { ref?: string | null } | null
  refunds?: RawRefund[] | null
}

// What the broker GET tells us live. Null means the broker was unreachable.
export type BrokerLive = {
  status: string
  mollie_payment_id: string | null
  captured_at: string | null
} | null

export type RefundView = {
  id: string
  amount: number
  created_at: string
  reason: string | null
}

export type PaymentView = {
  ref: string | null
  status: string
  mollie_payment_id: string | null
  captured_at: string | null
  currency: string
  amount: number
  captured_total: number
  refunded_total: number
  remaining_refundable: number
  refunds: RefundView[]
  broker_unavailable: boolean
}

export function toAmount(value: AmountLike): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (value && typeof value === "object" && "numeric" in value) {
    return toAmount((value as { numeric?: number | string | null }).numeric ?? 0)
  }
  return 0
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

export function buildPaymentView(
  payment: RawMedusaPayment,
  broker: BrokerLive
): PaymentView {
  const capturedTotal = round2(toAmount(payment.captured_amount))
  const refundedTotal = round2(toAmount(payment.refunded_amount))
  const refunds: RefundView[] = (payment.refunds ?? []).map((r) => ({
    id: r.id ?? "",
    amount: round2(toAmount(r.amount)),
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : (r.created_at ?? ""),
    reason: r.refund_reason?.label ?? null,
  }))
  refunds.sort((a, b) => refundCreatedAtMs(b) - refundCreatedAtMs(a))

  const capturedAt =
    payment.captured_at instanceof Date
      ? payment.captured_at.toISOString()
      : (payment.captured_at ?? null)

  return {
    ref: payment.data?.ref ?? null,
    status:
      broker?.status ??
      deriveStatusFromMedusa(payment, capturedTotal, refundedTotal),
    mollie_payment_id: broker?.mollie_payment_id ?? null,
    captured_at: broker?.captured_at ?? capturedAt,
    currency: (payment.currency_code ?? "").toUpperCase(),
    amount: round2(toAmount(payment.amount)),
    captured_total: capturedTotal,
    refunded_total: refundedTotal,
    remaining_refundable: computeRemainingRefundable(capturedTotal, refundedTotal),
    refunds,
    broker_unavailable: broker === null,
  }
}
