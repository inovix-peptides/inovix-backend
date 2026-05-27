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

import { suggestBox, type BoxPreset } from "../box-selector"

describe("suggestBox", () => {
  const presets: BoxPreset[] = [
    { id: "s", name: "Small",  lengthCm: 20, widthCm: 15, heightCm: 10, maxItems: 2 },
    { id: "m", name: "Medium", lengthCm: 28, widthCm: 20, heightCm: 12, maxItems: 5 },
    { id: "l", name: "Large",  lengthCm: 40, widthCm: 30, heightCm: 20, maxItems: 10 },
  ]

  it("picks the smallest box whose maxItems covers the total quantity", () => {
    expect(suggestBox(presets, 3).id).toBe("m")
    expect(suggestBox(presets, 1).id).toBe("s")
    expect(suggestBox(presets, 10).id).toBe("l")
  })

  it("falls back to the largest box and flags overflow when nothing fits", () => {
    const result = suggestBox(presets, 99)
    expect(result.id).toBe("l")
    expect(result.overflow).toBe(true)
  })

  it("throws if presets is empty", () => {
    expect(() => suggestBox([], 1)).toThrow(/no box presets/i)
  })
})
