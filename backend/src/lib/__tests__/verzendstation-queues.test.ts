import {
  buildVerzendstationQueues,
  selectStaleUnshipped,
  type QueueOrderRow,
} from "../verzendstation-queues"

const BROKER = "pp_via_broker_via_broker"

function paidPayment() {
  return {
    payments: [
      { provider_id: BROKER, amount: 100, captured_amount: 100, refunded_amount: 0, canceled_at: null },
    ],
  }
}

function row(overrides: Partial<QueueOrderRow>): QueueOrderRow {
  return {
    id: "order_1",
    display_id: 28411,
    status: "pending",
    created_at: "2026-07-14T08:00:00.000Z",
    email: "jan@example.com",
    shipping_address: { first_name: "Jan", last_name: "Jansen" },
    items: [
      { id: "item_1", quantity: 2 },
      { id: "item_2", quantity: 1 },
    ],
    fulfillments: [],
    payment_collections: [paidPayment()],
    ...overrides,
  }
}

describe("buildVerzendstationQueues", () => {
  it("puts a paid, unfulfilled order in to_process with name and item count", () => {
    const q = buildVerzendstationQueues([row({})])
    expect(q.to_process).toHaveLength(1)
    expect(q.to_ship).toHaveLength(0)
    expect(q.to_process[0]).toMatchObject({
      id: "order_1",
      display_id: 28411,
      customer_name: "Jan Jansen",
      item_count: 3,
    })
  })

  it("excludes unpaid, refunded and canceled orders from to_process", () => {
    const unpaid = row({
      id: "o2",
      payment_collections: [
        { payments: [{ provider_id: BROKER, amount: 100, captured_amount: 0, refunded_amount: 0, canceled_at: null }] },
      ],
    })
    const refunded = row({
      id: "o3",
      payment_collections: [
        { payments: [{ provider_id: BROKER, amount: 100, captured_amount: 100, refunded_amount: 100, canceled_at: null }] },
      ],
    })
    const canceled = row({ id: "o4", status: "canceled" })
    const noPayment = row({ id: "o5", payment_collections: [] })
    const q = buildVerzendstationQueues([unpaid, refunded, canceled, noPayment])
    expect(q.to_process).toHaveLength(0)
    expect(q.to_ship).toHaveLength(0)
  })

  it("puts packed-but-not-shipped orders in to_ship and drops shipped ones", () => {
    const packed = row({
      id: "o6",
      fulfillments: [{ id: "f1", packed_at: "2026-07-13T10:00:00.000Z", shipped_at: null, canceled_at: null }],
    })
    const shipped = row({
      id: "o7",
      fulfillments: [{ id: "f2", packed_at: "2026-07-13T10:00:00.000Z", shipped_at: "2026-07-13T15:00:00.000Z", canceled_at: null }],
    })
    const q = buildVerzendstationQueues([packed, shipped])
    expect(q.to_ship.map((e) => e.id)).toEqual(["o6"])
    expect(q.to_process).toHaveLength(0)
  })

  it("ignores canceled fulfillments (a redo lands back in to_process)", () => {
    const redo = row({
      id: "o8",
      fulfillments: [{ id: "f3", packed_at: "2026-07-13T10:00:00.000Z", shipped_at: null, canceled_at: "2026-07-13T11:00:00.000Z" }],
    })
    const q = buildVerzendstationQueues([redo])
    expect(q.to_process.map((e) => e.id)).toEqual(["o8"])
  })

  it("sorts to_process oldest-first by created_at and to_ship oldest-first by packed_at", () => {
    const older = row({ id: "a", created_at: "2026-07-14T06:00:00.000Z" })
    const newer = row({ id: "b", created_at: "2026-07-14T09:00:00.000Z" })
    const q = buildVerzendstationQueues([newer, older])
    expect(q.to_process.map((e) => e.id)).toEqual(["a", "b"])
  })

  it("falls back to the email when the address has no name", () => {
    const q = buildVerzendstationQueues([row({ shipping_address: null })])
    expect(q.to_process[0].customer_name).toBe("jan@example.com")
  })
})

describe("selectStaleUnshipped", () => {
  const NOW = new Date("2026-07-14T12:00:00.000Z").getTime()
  const DAY = 24 * 60 * 60 * 1000
  it("selects only to_ship entries packed more than maxAgeMs ago", () => {
    const stale = row({
      id: "old",
      fulfillments: [{ id: "f", packed_at: "2026-07-12T10:00:00.000Z", shipped_at: null, canceled_at: null }],
    })
    const fresh = row({
      id: "new",
      fulfillments: [{ id: "f", packed_at: "2026-07-14T10:00:00.000Z", shipped_at: null, canceled_at: null }],
    })
    const q = buildVerzendstationQueues([stale, fresh])
    expect(selectStaleUnshipped(q, NOW, DAY).map((e) => e.id)).toEqual(["old"])
  })
})
