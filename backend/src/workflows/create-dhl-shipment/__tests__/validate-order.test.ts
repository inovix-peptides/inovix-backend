jest.mock("@medusajs/framework/workflows-sdk", () => ({
  createStep: (_name: string, fn: any) => fn,
  StepResponse: class {
    constructor(public output: any) {}
  },
}))

import validateOrder from "../steps/validate-order"

describe("validate-order step", () => {
  const baseOrder = {
    id: "o1", display_id: 1001, status: "captured",
    shipping_methods: [{ data: { id: "dhl-standard" }, shipping_option: { metadata: { dhl_product_code: "H" } } }],
    items: [{ quantity: 1, product: { id: "p1", weight: 100, title: "Vial" } }],
  }

  it("returns ok for a valid DHL-shipped order", async () => {
    const result = await validateOrder({ order: baseOrder, boxes: [{ max_items: 10 } as any] } as any, {} as any)
    expect(result.output).toMatchObject({ valid: true })
  })

  it("fails when order has no DHL shipping method", async () => {
    const order = { ...baseOrder, shipping_methods: [{ data: { id: "manual" } }] }
    await expect(validateOrder({ order, boxes: [{ max_items: 10 } as any] } as any, {} as any)).rejects.toThrow(/no DHL shipping/i)
  })

  it("fails when any product is missing weight", async () => {
    const order = { ...baseOrder, items: [{ quantity: 1, product: { id: "p1", weight: null, title: "X" } }] }
    await expect(validateOrder({ order, boxes: [{ max_items: 10 } as any] } as any, {} as any)).rejects.toThrow(/missing weight/i)
  })

  it("fails when no boxes are configured", async () => {
    await expect(validateOrder({ order: baseOrder, boxes: [] } as any, {} as any)).rejects.toThrow(/no box presets/i)
  })

  it("fails when order is cancelled", async () => {
    await expect(validateOrder({ order: { ...baseOrder, status: "canceled" }, boxes: [{} as any] } as any, {} as any))
      .rejects.toThrow(/cancelled|canceled/i)
  })
})
