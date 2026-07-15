import {
  toAmount,
  computeRemainingRefundable,
  normalizeBrokerPayment,
  validateRefundAmount,
  buildPaymentView,
  type RawMedusaPayment,
  type BrokerLive,
} from "../order-payment-broker.logic"

describe("toAmount", () => {
  it("passes a plain number through", () => {
    expect(toAmount(12.5)).toBe(12.5)
  })

  it("parses a numeric string", () => {
    expect(toAmount("9.99")).toBe(9.99)
  })

  it("reads the .numeric field of a BigNumber-like object", () => {
    expect(toAmount({ numeric: 4.2 })).toBe(4.2)
    expect(toAmount({ numeric: "7.5" })).toBe(7.5)
  })

  it("treats null/undefined/garbage as 0", () => {
    expect(toAmount(null)).toBe(0)
    expect(toAmount(undefined)).toBe(0)
    expect(toAmount({})).toBe(0)
    expect(toAmount("abc")).toBe(0)
  })

  it("reads the raw BigNumber {value, precision} shape query.graph returns", () => {
    expect(toAmount({ value: "34.95", precision: 20 })).toBe(34.95)
    expect(toAmount({ value: 34.95 })).toBe(34.95)
  })
})

describe("normalizeBrokerPayment", () => {
  // Regression for prod order_01KXBZVPHPJYMV8BQC8VDFH3GH: query.graph has NO
  // captured_amount/refunded_amount fields on payment (they live on
  // payment_collection; real captures/refunds are rows), and bigNumber
  // columns can surface as {value, precision}. The view showed Bedrag 0,00
  // and the checklist payment gate blocked a fully paid order.
  it("computes captured/refunded from capture and refund rows and parses raw amounts", () => {
    const payment: RawMedusaPayment = {
      id: "pay_1",
      amount: { value: "34.95", precision: 20 } as never,
      raw_amount: { value: "34.95", precision: 20 } as never,
      captured_at: "2026-07-12T20:21:22.981Z",
      captures: [{ amount: { value: "34.95", precision: 20 } as never }],
      refunds: [],
    }
    const n = normalizeBrokerPayment(payment)
    expect(n.amount).toBe(34.95)
    expect(n.captured_amount).toBe(34.95)
    expect(n.refunded_amount).toBe(0)
  })

  it("sums multiple captures and refunds", () => {
    const n = normalizeBrokerPayment({
      id: "pay_2",
      amount: 100,
      captures: [{ amount: 60 }, { amount: "40" }],
      refunds: [{ amount: 10 }, { amount: { value: "5" } as never }],
    })
    expect(n.captured_amount).toBe(100)
    expect(n.refunded_amount).toBe(15)
  })

  it("keeps a larger pre-existing captured_amount and falls back to raw_amount", () => {
    const n = normalizeBrokerPayment({
      id: "pay_3",
      amount: undefined,
      raw_amount: { value: "20" } as never,
      captured_amount: 20,
      captures: [],
      refunds: null,
    })
    expect(n.amount).toBe(20)
    expect(n.captured_amount).toBe(20)
    expect(n.refunded_amount).toBe(0)
  })
})

describe("computeRemainingRefundable", () => {
  it("is captured minus refunded", () => {
    expect(computeRemainingRefundable(100, 30)).toBe(70)
  })

  it("never goes below zero", () => {
    expect(computeRemainingRefundable(50, 80)).toBe(0)
  })

  it("rounds to cents to avoid float dust", () => {
    expect(computeRemainingRefundable(0.3, 0.1)).toBe(0.2)
  })
})

describe("validateRefundAmount", () => {
  it("accepts an amount within the refundable range", () => {
    expect(validateRefundAmount(20, 70)).toEqual({ ok: true })
  })

  it("accepts exactly the remaining refundable", () => {
    expect(validateRefundAmount(70, 70)).toEqual({ ok: true })
  })

  it("rejects zero", () => {
    const r = validateRefundAmount(0, 70)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/groter dan 0/i)
  })

  it("rejects a negative amount", () => {
    expect(validateRefundAmount(-5, 70).ok).toBe(false)
  })

  it("rejects a non-finite amount", () => {
    expect(validateRefundAmount(Number.NaN, 70).ok).toBe(false)
  })

  it("rejects more than the remaining refundable", () => {
    const r = validateRefundAmount(80, 70)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/70/)
  })

  it("tolerates a sub-cent float overshoot at the boundary", () => {
    expect(validateRefundAmount(70.0000001, 70).ok).toBe(true)
  })

  it("rejects when nothing is left to refund", () => {
    expect(validateRefundAmount(1, 0).ok).toBe(false)
  })
})

describe("buildPaymentView", () => {
  const basePayment: RawMedusaPayment = {
    id: "pay_1",
    provider_id: "pp_via_broker_via_broker",
    currency_code: "eur",
    amount: 100,
    captured_amount: 100,
    refunded_amount: 30,
    captured_at: "2026-06-01T10:00:00.000Z",
    canceled_at: null,
    data: { ref: "pay_abc" },
    refunds: [
      {
        id: "ref_1",
        amount: 30,
        created_at: "2026-06-02T09:00:00.000Z",
        note: "klant retour",
        refund_reason: { label: "Defect" },
      },
    ],
  }

  it("merges broker live status over the medusa record", () => {
    const broker: BrokerLive = {
      status: "captured",
      mollie_payment_id: "tr_live123",
      captured_at: "2026-06-01T10:00:00.000Z",
    }
    const view = buildPaymentView(basePayment, broker)

    expect(view.status).toBe("captured")
    expect(view.mollie_payment_id).toBe("tr_live123")
    expect(view.ref).toBe("pay_abc")
    expect(view.currency).toBe("EUR")
    expect(view.amount).toBe(100)
    expect(view.captured_total).toBe(100)
    expect(view.refunded_total).toBe(30)
    expect(view.remaining_refundable).toBe(70)
    expect(view.broker_unavailable).toBe(false)
  })

  it("normalises and sorts refunds newest-first", () => {
    const payment: RawMedusaPayment = {
      ...basePayment,
      refunds: [
        { id: "r_old", amount: 10, created_at: "2026-06-02T08:00:00.000Z" },
        { id: "r_new", amount: 20, created_at: "2026-06-03T08:00:00.000Z", refund_reason: { label: "Te laat" } },
      ],
    }
    const view = buildPaymentView(payment, null)
    expect(view.refunds.map((r) => r.id)).toEqual(["r_new", "r_old"])
    expect(view.refunds[0]).toEqual({
      id: "r_new",
      amount: 20,
      created_at: "2026-06-03T08:00:00.000Z",
      reason: "Te laat",
    })
    expect(view.refunds[1].reason).toBeNull()
  })

  it("flags broker_unavailable and falls back to a medusa-derived status", () => {
    const view = buildPaymentView(basePayment, null)
    expect(view.broker_unavailable).toBe(true)
    // captured_at present, not fully refunded -> "captured"
    expect(view.status).toBe("captured")
    // mollie id unknown without the broker; null
    expect(view.mollie_payment_id).toBeNull()
  })

  it("derives 'refunded' when the medusa record is fully refunded and broker is down", () => {
    const view = buildPaymentView(
      { ...basePayment, refunded_amount: 100 },
      null
    )
    expect(view.status).toBe("refunded")
    expect(view.remaining_refundable).toBe(0)
  })

  it("derives 'canceled' when canceled_at is set and broker is down", () => {
    const view = buildPaymentView(
      { ...basePayment, canceled_at: "2026-06-04T00:00:00.000Z", captured_at: null, captured_amount: 0 },
      null
    )
    expect(view.status).toBe("canceled")
  })

  it("derives 'pending' for an uncaptured payment when broker is down", () => {
    const view = buildPaymentView(
      { ...basePayment, captured_at: null, captured_amount: 0, refunded_amount: 0, refunds: [] },
      null
    )
    expect(view.status).toBe("pending")
    expect(view.remaining_refundable).toBe(0)
  })

  it("handles a missing ref and empty refunds gracefully", () => {
    const view = buildPaymentView(
      { ...basePayment, data: null, refunds: null },
      null
    )
    expect(view.ref).toBeNull()
    expect(view.refunds).toEqual([])
  })
})

describe("buildPaymentView enrichment (method, paid_at, history)", () => {
  const payment: RawMedusaPayment = {
    id: "pay_h",
    provider_id: "pp_via_broker_via_broker",
    currency_code: "eur",
    amount: 34.95,
    captured_amount: 34.95,
    refunded_amount: 5,
    created_at: "2026-07-12T20:20:00.000Z",
    captured_at: "2026-07-12T20:21:22.000Z",
    canceled_at: null,
    data: { ref: "pay_abc" },
    captures: [{ amount: 34.95, created_at: "2026-07-12T20:21:23.000Z" }],
    refunds: [
      {
        id: "r1",
        amount: 5,
        created_at: "2026-07-13T09:00:00.000Z",
        note: "deels retour",
        refund_reason: { label: "Defect" },
      },
    ],
  }

  it("passes the broker method through and prefers mollie paid_at", () => {
    const view = buildPaymentView(payment, {
      status: "captured",
      mollie_payment_id: "tr_x",
      captured_at: "2026-07-12T20:21:22.000Z",
      method: "ideal",
      paid_at: "2026-07-12T20:21:25.000Z",
      mollie_status: "paid",
    })
    expect(view.method).toBe("ideal")
    expect(view.captured_at).toBe("2026-07-12T20:21:25.000Z")
    expect(view.mollie_status).toBe("paid")
  })

  it("defaults method/mollie_status to null when the broker is down or older", () => {
    const view = buildPaymentView(payment, null)
    expect(view.method).toBeNull()
    expect(view.mollie_status).toBeNull()
    const older = buildPaymentView(payment, {
      status: "captured",
      mollie_payment_id: "tr_x",
      captured_at: "2026-07-12T20:21:22.000Z",
    })
    expect(older.method).toBeNull()
  })

  it("builds a newest-first history from created, captures and refunds", () => {
    const view = buildPaymentView(payment, null)
    expect(view.history.map((e) => e.type)).toEqual(["refunded", "captured", "created"])
    expect(view.history[0]).toMatchObject({
      type: "refunded",
      at: "2026-07-13T09:00:00.000Z",
      amount: 5,
      note: "Defect",
    })
    expect(view.history[1]).toMatchObject({ type: "captured", amount: 34.95 })
    expect(view.history[2]).toMatchObject({ type: "created", amount: 34.95 })
  })

  it("adds a canceled event when the payment was canceled", () => {
    const view = buildPaymentView(
      { ...payment, canceled_at: "2026-07-14T08:00:00.000Z", refunds: [], captures: [] },
      null
    )
    expect(view.history[0]).toMatchObject({ type: "canceled", at: "2026-07-14T08:00:00.000Z" })
  })
})
