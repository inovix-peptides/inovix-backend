import { selectAutoShipCandidates, type AutoShipOrderRow } from "../auto-mark-shipped"

function row(overrides: Partial<AutoShipOrderRow>): AutoShipOrderRow {
  return {
    id: "order_1",
    status: "pending",
    shipping_address: { postal_code: "3201 ME" },
    fulfillments: [
      {
        id: "f1",
        provider_id: "dhl-parcel_dhl-parcel",
        packed_at: "2026-07-14T15:17:59.000Z",
        shipped_at: null,
        canceled_at: null,
        data: { dhl_tracking_number: "JVGL0000000000000001" },
      },
    ],
    ...overrides,
  }
}

describe("selectAutoShipCandidates", () => {
  it("selects packed, unshipped DHL fulfillments with a tracking number", () => {
    const out = selectAutoShipCandidates([row({})])
    expect(out).toEqual([
      {
        order_id: "order_1",
        tracking_number: "JVGL0000000000000001",
        postal_code: "3201 ME",
      },
    ])
  })

  it("skips shipped, canceled, unpacked and non-DHL fulfillments", () => {
    const shipped = row({
      id: "o2",
      fulfillments: [{ ...row({}).fulfillments![0], shipped_at: "2026-07-15T08:00:00Z" }],
    })
    const canceled = row({
      id: "o3",
      fulfillments: [{ ...row({}).fulfillments![0], canceled_at: "2026-07-15T08:00:00Z" }],
    })
    const unpacked = row({
      id: "o4",
      fulfillments: [{ ...row({}).fulfillments![0], packed_at: null }],
    })
    const manual = row({
      id: "o5",
      fulfillments: [
        { id: "f", provider_id: "manual_manual", packed_at: "2026-07-14T15:00:00Z", shipped_at: null, canceled_at: null, data: {} },
      ],
    })
    const noTracking = row({
      id: "o6",
      fulfillments: [{ ...row({}).fulfillments![0], data: {} }],
    })
    const canceledOrder = row({ id: "o7", status: "canceled" })
    expect(
      selectAutoShipCandidates([shipped, canceled, unpacked, manual, noTracking, canceledOrder])
    ).toEqual([])
  })

  it("prefers the unshipped fulfillment when a shipped redo pair exists", () => {
    const pair = row({
      id: "o8",
      fulfillments: [
        { ...row({}).fulfillments![0], id: "old", canceled_at: "2026-07-14T16:00:00Z" },
        { ...row({}).fulfillments![0], id: "new", data: { dhl_tracking_number: "JVGL0000000000000002" } },
      ],
    })
    expect(selectAutoShipCandidates([pair])[0].tracking_number).toBe("JVGL0000000000000002")
  })
})
