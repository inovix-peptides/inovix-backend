// The workflows-sdk pulls in the whole Medusa framework at import time; stub
// createStep/StepResponse so the step is a plain async fn under jest (mirrors
// the old DHL Express validate-order test).
jest.mock("@medusajs/framework/workflows-sdk", () => ({
  createStep: (_name: string, fn: any) => fn,
  StepResponse: class {
    constructor(public output: any) {}
  },
}))

// MedusaError pulls in framework internals; stub it to a plain Error subclass.
jest.mock("@medusajs/framework/utils", () => {
  class MedusaError extends Error {
    static Types = { INVALID_DATA: "INVALID_DATA", NOT_ALLOWED: "NOT_ALLOWED" }
    public type: string
    constructor(type: string, message: string) {
      super(message)
      this.type = type
    }
  }
  return { MedusaError }
})

import validateOrder from "../steps/validate-order"

// A container whose dhl_parcel_boxes module returns the given presets.
function makeContainer(presets: any[]) {
  const boxesService = {
    listDhlParcelBoxPresets: jest.fn(async () => presets),
  }
  return {
    resolve: jest.fn((_key: string) => boxesService),
    __boxesService: boxesService,
  } as any
}

const baseOrder = {
  id: "order_1",
  display_id: 1042,
  status: "captured",
  shipping_methods: [
    {
      shipping_option: { provider_id: "dhl-parcel" },
      data: { dhl_option: "DOOR" },
    },
  ],
  items: [{ quantity: 1, product: { id: "p1", title: "Vial", weight: 100 } }],
}

const presets = [{ id: "box_1", max_items: 10, parcel_type_key: "MEDIUM" }]

const PAID_PAYMENT = { amount: 100, captured_amount: 100, refunded_amount: 0, canceled_at: null }

describe("validate-order step (DHL Parcel)", () => {
  it("returns valid for a well-formed DHL Parcel order", async () => {
    const result = await validateOrder(
      { order: baseOrder, payment: PAID_PAYMENT } as any,
      { container: makeContainer(presets) } as any,
    )
    expect(result.output).toMatchObject({ valid: true })
  })

  it("throws when the order status is 'canceled' (American spelling)", async () => {
    await expect(
      validateOrder(
        { order: { ...baseOrder, status: "canceled" }, payment: PAID_PAYMENT } as any,
        { container: makeContainer(presets) } as any,
      ),
    ).rejects.toThrow(/cancel/i)
  })

  it("throws when the order status is 'cancelled' (British spelling)", async () => {
    await expect(
      validateOrder(
        { order: { ...baseOrder, status: "cancelled" }, payment: PAID_PAYMENT } as any,
        { container: makeContainer(presets) } as any,
      ),
    ).rejects.toThrow(/cancel/i)
  })

  it("throws when the order status is 'refunded'", async () => {
    await expect(
      validateOrder(
        { order: { ...baseOrder, status: "refunded" }, payment: PAID_PAYMENT } as any,
        { container: makeContainer(presets) } as any,
      ),
    ).rejects.toThrow(/refund/i)
  })

  it("throws when the order has no items", async () => {
    await expect(
      validateOrder(
        { order: { ...baseOrder, items: [] }, payment: PAID_PAYMENT } as any,
        { container: makeContainer(presets) } as any,
      ),
    ).rejects.toThrow(/no items|geen.*items|items/i)
  })

  it("throws when the order has no DHL Parcel shipping method", async () => {
    const order = {
      ...baseOrder,
      shipping_methods: [
        { shipping_option: { provider_id: "manual" }, data: { id: "manual" } },
      ],
    }
    await expect(
      validateOrder(
        { order, payment: PAID_PAYMENT } as any,
        { container: makeContainer(presets) } as any,
      ),
    ).rejects.toThrow(/DHL Parcel/i)
  })

  it("throws when any item is missing a product weight", async () => {
    const order = {
      ...baseOrder,
      items: [{ quantity: 1, product: { id: "p1", title: "X", weight: null } }],
    }
    await expect(
      validateOrder(
        { order, payment: PAID_PAYMENT } as any,
        { container: makeContainer(presets) } as any,
      ),
    ).rejects.toThrow(/gewicht/i)
  })

  it("throws when no box presets are configured", async () => {
    await expect(
      validateOrder(
        { order: baseOrder, payment: PAID_PAYMENT } as any,
        { container: makeContainer([]) } as any,
      ),
    ).rejects.toThrow(/box preset/i)
  })

  it("detects the DHL Parcel method via data.dhl_option when provider_id is absent", async () => {
    const order = {
      ...baseOrder,
      shipping_methods: [{ data: { dhl_option: "PS", service_point_id: "sp-1" } }],
    }
    const result = await validateOrder(
      { order, payment: PAID_PAYMENT } as any,
      { container: makeContainer(presets) } as any,
    )
    expect(result.output).toMatchObject({ valid: true })
  })
})

describe("payment gate", () => {
  it("throws NOT_ALLOWED when there is no payment", async () => {
    await expect(
      validateOrder(
        { order: baseOrder, payment: null } as any,
        { container: makeContainer(presets) } as any,
      ),
    ).rejects.toThrow(/Geen betaling gevonden/)
  })

  it("throws when the payment is not fully captured", async () => {
    await expect(
      validateOrder(
        {
          order: baseOrder,
          payment: { amount: 100, captured_amount: 40, refunded_amount: 0, canceled_at: null },
        } as any,
        { container: makeContainer(presets) } as any,
      ),
    ).rejects.toThrow(/nog niet \(volledig\) ontvangen/)
  })

  it("throws when anything was refunded", async () => {
    await expect(
      validateOrder(
        {
          order: baseOrder,
          payment: { amount: 100, captured_amount: 100, refunded_amount: 10, canceled_at: null },
        } as any,
        { container: makeContainer(presets) } as any,
      ),
    ).rejects.toThrow(/terugbetaald/)
  })

  it("passes when the gate fails but paymentOverridden is true", async () => {
    const result = await validateOrder(
      { order: baseOrder, payment: null, paymentOverridden: true } as any,
      { container: makeContainer(presets) } as any,
    )
    expect(result.output).toMatchObject({ valid: true })
  })
})
