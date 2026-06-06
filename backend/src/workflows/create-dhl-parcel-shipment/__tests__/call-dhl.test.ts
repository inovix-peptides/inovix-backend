jest.mock("@medusajs/framework/workflows-sdk", () => ({
  createStep: (_name: string, fn: any) => fn,
  StepResponse: class {
    constructor(public output: any) {}
  },
}))

jest.mock("@medusajs/framework/utils", () => {
  class MedusaError extends Error {
    static Types = { INVALID_DATA: "INVALID_DATA", NOT_ALLOWED: "NOT_ALLOWED" }
    public type: string
    constructor(type: string, message: string) {
      super(message)
      this.type = type
    }
  }
  return {
    Modules: { FULFILLMENT: "fulfillment", STOCK_LOCATION: "stock-location" },
    MedusaError,
  }
})

import callDhl from "../steps/call-dhl"

// The container now has two services: the stock-location module (owns
// listStockLocations) and the fulfillment module (owns createFulfillment).
function makeContainer(
  fulfillment: any,
  stockLocations: any[] = [{ id: "loc_1" }],
) {
  const stockLocationService = {
    listStockLocations: jest.fn(async () => stockLocations),
  }
  const fulfillmentService = {
    createFulfillment: jest.fn(async () => fulfillment),
  }
  const container = {
    resolve: jest.fn((key: string) => {
      if (key === "stock-location") return stockLocationService
      if (key === "fulfillment") return fulfillmentService
      throw new Error(`Unexpected resolve key: ${key}`)
    }),
  }
  return { container, __stockLocationService: stockLocationService, __fulfillmentService: fulfillmentService }
}

// Mirrors the build-payload step output: dhl_* data fields + the enriched items.
const payload = {
  dhl_option: "DOOR",
  service_point_id: undefined,
  dhl_parcel_type_key: "MEDIUM",
  dhl_box_dimensions: { length: 28, width: 20, height: 12 },
  dhl_total_weight_grams: 300,
  total_units: 2,
  items: [{ quantity: 2, product: { weight: 150 } }],
}

describe("call-dhl step (DHL Parcel)", () => {
  const deliveryAddress = { country_code: "nl", postal_code: "3000AA" }

  it("invokes createFulfillment with provider_id dhl-parcel_dhl-parcel, the location, order, and the enriched items", async () => {
    const created = { id: "ful_1", data: { dhl_tracking_number: "JVGL123NL" } }
    const { container, __fulfillmentService } = makeContainer(created)

    await callDhl(
      { order_id: "order_1", payload, delivery_address: deliveryAddress } as any,
      { container } as any,
    )

    expect(container.resolve).toHaveBeenCalledWith("stock-location")
    expect(container.resolve).toHaveBeenCalledWith("fulfillment")
    expect(__fulfillmentService.createFulfillment).toHaveBeenCalledTimes(1)
    const arg = __fulfillmentService.createFulfillment.mock.calls[0][0]
    expect(arg.provider_id).toBe("dhl-parcel_dhl-parcel")
    expect(arg.location_id).toBe("loc_1")
    expect(arg.order).toEqual({ id: "order_1" })
    expect(arg.items).toEqual(payload.items)
    expect(arg.delivery_address).toEqual(deliveryAddress)
  })

  it("passes the dhl_* data fields (minus items) as the fulfillment data", async () => {
    const created = { id: "ful_1" }
    const { container, __fulfillmentService } = makeContainer(created)

    await callDhl({ order_id: "order_1", payload } as any, { container } as any)

    const arg = __fulfillmentService.createFulfillment.mock.calls[0][0]
    // items must NOT leak into data; the dhl_* fields must be present.
    expect(arg.data.items).toBeUndefined()
    expect(arg.data).toMatchObject({
      dhl_option: "DOOR",
      dhl_parcel_type_key: "MEDIUM",
      dhl_box_dimensions: { length: 28, width: 20, height: 12 },
    })
  })

  it("returns the created fulfillment", async () => {
    const created = { id: "ful_42" }
    const { container } = makeContainer(created)

    const result = await callDhl({ order_id: "order_1", payload } as any, { container } as any)

    expect(result.output).toBe(created)
  })

  it("throws a clear MedusaError when no stock location is configured", async () => {
    const { container } = makeContainer({}, [])
    await expect(
      callDhl({ order_id: "order_1", payload } as any, { container } as any),
    ).rejects.toThrow(/stock location/i)
  })
})
