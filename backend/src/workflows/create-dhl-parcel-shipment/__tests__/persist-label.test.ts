jest.mock("@medusajs/framework/workflows-sdk", () => ({
  createStep: (_name: string, fn: any) => fn,
  StepResponse: class {
    constructor(public output: any) {}
  },
}))

import persistLabel from "../steps/persist-label"

describe("persist-label step (DHL Parcel)", () => {
  it("returns the fulfillment id from the created fulfillment", async () => {
    const result = await persistLabel(
      { fulfillment: { id: "ful_99" } } as any,
      {} as any,
    )
    expect(result.output).toEqual({ fulfillment_id: "ful_99" })
  })
})
