import {
  normalizeThreshold,
  validateFreeShippingThreshold,
} from "../free-shipping-threshold"

describe("normalizeThreshold", () => {
  it("returns null for empty / null / undefined (free shipping off)", () => {
    expect(normalizeThreshold(undefined)).toBeNull()
    expect(normalizeThreshold(null)).toBeNull()
    expect(normalizeThreshold("")).toBeNull()
    expect(normalizeThreshold("   ")).toBeNull()
  })

  it("parses a numeric string to a number", () => {
    expect(normalizeThreshold("75")).toBe(75)
    expect(normalizeThreshold(" 75 ")).toBe(75)
  })

  it("accepts a comma decimal separator", () => {
    expect(normalizeThreshold("74,50")).toBe(74.5)
  })

  it("passes through a positive number", () => {
    expect(normalizeThreshold(75)).toBe(75)
  })

  it("returns null for zero or negative (free shipping off)", () => {
    expect(normalizeThreshold(0)).toBeNull()
    expect(normalizeThreshold("0")).toBeNull()
    expect(normalizeThreshold(-10)).toBeNull()
    expect(normalizeThreshold("-10")).toBeNull()
  })

  it("returns null for non-numeric junk", () => {
    expect(normalizeThreshold("gratis")).toBeNull()
    expect(normalizeThreshold({})).toBeNull()
  })
})

describe("validateFreeShippingThreshold", () => {
  it("accepts empty / null / undefined (means off)", () => {
    expect(validateFreeShippingThreshold(undefined)).toEqual([])
    expect(validateFreeShippingThreshold(null)).toEqual([])
    expect(validateFreeShippingThreshold("")).toEqual([])
  })

  it("accepts a valid positive number or numeric string", () => {
    expect(validateFreeShippingThreshold(75)).toEqual([])
    expect(validateFreeShippingThreshold("75")).toEqual([])
    expect(validateFreeShippingThreshold("74,50")).toEqual([])
    expect(validateFreeShippingThreshold("0")).toEqual([])
  })

  it("rejects negative and non-numeric values", () => {
    expect(validateFreeShippingThreshold(-1).length).toBe(1)
    expect(validateFreeShippingThreshold("abc").length).toBe(1)
  })
})
