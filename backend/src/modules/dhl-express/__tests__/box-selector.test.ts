import { sumOrderWeightKg } from "../box-selector"

describe("sumOrderWeightKg", () => {
  it("sums product.weight * quantity across line items, treating product.weight as grams", () => {
    const items = [
      { quantity: 2, product: { weight: 50 } },
      { quantity: 1, product: { weight: 250 } },
    ]
    expect(sumOrderWeightKg(items)).toBeCloseTo(0.35, 3)
  })

  it("returns 0 for an empty order", () => {
    expect(sumOrderWeightKg([])).toBe(0)
  })

  it("throws if any line item is missing product.weight", () => {
    expect(() =>
      sumOrderWeightKg([{ quantity: 1, product: { weight: null as any, title: "X", id: "p1" } }]),
    ).toThrow(/missing weight/i)
  })
})
