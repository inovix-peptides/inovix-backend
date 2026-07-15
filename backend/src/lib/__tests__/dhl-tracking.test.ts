import { mapDhlTracking, type DhlRawShipment } from "../dhl-tracking"

// Shape taken from a real api-gw.dhlparcel.nl/track-trace response
// (order 28417, barcode redacted).
const underway: DhlRawShipment = {
  barcode: "JVGL0000000000000000",
  deliveredAt: null,
  events: [
    {
      timestamp: "2026-07-14T15:17:59.798Z",
      status: "PRENOTIFICATION_RECEIVED",
      category: "DATA_RECEIVED",
    },
    {
      timestamp: "2026-07-14T15:18:00Z",
      status: "DATA_RECEIVED_WITH_PREFIX_LABEL",
      category: "DATA_RECEIVED",
    },
    {
      timestamp: "2026-07-15T08:19:21.125Z",
      status: "SHIPMENT_ACCEPTANCE_PARCELSHOP",
      category: "UNDERWAY",
    },
  ],
}

describe("mapDhlTracking", () => {
  it("maps an underway shipment: phase, handed_to_dhl, newest-first Dutch events", () => {
    const v = mapDhlTracking(underway)
    expect(v.phase).toBe("onderweg")
    expect(v.phase_label).toBe("Onderweg")
    expect(v.handed_to_dhl).toBe(true)
    expect(v.delivered_at).toBeNull()
    expect(v.last_event_at).toBe("2026-07-15T08:19:21.125Z")
    expect(v.events.map((e) => e.at)).toEqual([
      "2026-07-15T08:19:21.125Z",
      "2026-07-14T15:18:00Z",
      "2026-07-14T15:17:59.798Z",
    ])
    expect(v.events[0].title).toBe("Afgegeven bij DHL-punt")
    expect(v.events[2].title).toBe("Zending aangemeld bij DHL")
  })

  it("is aangemeld (not handed over) when only DATA_RECEIVED events exist", () => {
    const v = mapDhlTracking({
      ...underway,
      events: underway.events!.slice(0, 2),
    })
    expect(v.phase).toBe("aangemeld")
    expect(v.handed_to_dhl).toBe(false)
  })

  it("is bezorgd when deliveredAt is set or a DELIVERED category appears", () => {
    const delivered = mapDhlTracking({
      ...underway,
      deliveredAt: "2026-07-16T11:00:00Z",
    })
    expect(delivered.phase).toBe("bezorgd")
    expect(delivered.delivered_at).toBe("2026-07-16T11:00:00Z")

    const viaEvent = mapDhlTracking({
      ...underway,
      events: [
        ...underway.events!,
        { timestamp: "2026-07-16T11:00:00Z", status: "DELIVERED", category: "DELIVERED" },
      ],
    })
    expect(viaEvent.phase).toBe("bezorgd")
  })

  it("humanizes unknown statuses instead of showing raw codes", () => {
    const v = mapDhlTracking({
      ...underway,
      events: [{ timestamp: "2026-07-15T09:00:00Z", status: "SOME_NEW_STATUS_CODE", category: "UNDERWAY" }],
    })
    expect(v.events[0].title).toBe("Some new status code")
  })

  it("degrades to onbekend on null/empty input", () => {
    expect(mapDhlTracking(null).phase).toBe("onbekend")
    expect(mapDhlTracking({}).phase).toBe("onbekend")
    expect(mapDhlTracking({ events: [] }).events).toEqual([])
  })
})

describe("buildDhlConsumerTrackingUrl", () => {
  const { buildDhlConsumerTrackingUrl } = require("../dhl-tracking")

  it("builds the my.dhlecommerce.nl deep link with compacted postcode", () => {
    expect(buildDhlConsumerTrackingUrl("JVGL0000000000000001", "3201 me")).toBe(
      "https://my.dhlecommerce.nl/home/tracktrace/JVGL0000000000000001/3201ME?lang=nl_NL"
    )
  })

  it("supports a language and works without a postcode", () => {
    expect(buildDhlConsumerTrackingUrl("JVGL1", "1011AB", "en_GB")).toBe(
      "https://my.dhlecommerce.nl/home/tracktrace/JVGL1/1011AB?lang=en_GB"
    )
    expect(buildDhlConsumerTrackingUrl("JVGL1", null)).toBe(
      "https://my.dhlecommerce.nl/home/tracktrace/JVGL1?lang=nl_NL"
    )
  })
})
