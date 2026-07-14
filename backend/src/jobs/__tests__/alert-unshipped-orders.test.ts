import { buildAlertPayload } from "../alert-unshipped-orders"

describe("buildAlertPayload", () => {
  const stale = [
    {
      id: "order_1",
      display_id: 28411,
      customer_name: "Jan Jansen",
      item_count: 3,
      created_at: "2026-07-12T08:00:00.000Z",
      packed_at: "2026-07-12T10:00:00.000Z",
    },
    {
      id: "order_2",
      display_id: null,
      customer_name: "",
      item_count: 1,
      created_at: null,
      packed_at: null,
    },
  ]

  it("maps entries to template rows with Dutch dates and safe fallbacks", () => {
    const p = buildAlertPayload(stale, "2026-07-14")
    expect(p.idempotency_key).toBe("unshipped-orders-alert-2026-07-14")
    expect(p.data.orders[0]).toEqual({
      display_id: "28411",
      customer_name: "Jan Jansen",
      packed_at: expect.stringContaining("juli"),
    })
    expect(p.data.orders[1].display_id).toBe("?")
    expect(p.data.orders[1].customer_name).toBe("Onbekende klant")
  })

  it("subject counts the orders", () => {
    expect(buildAlertPayload(stale, "2026-07-14").data.emailOptions.subject).toContain("2")
  })
})
