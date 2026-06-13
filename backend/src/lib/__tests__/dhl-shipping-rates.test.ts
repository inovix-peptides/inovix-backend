import {
  COUNTRY_CODE_ATTRIBUTE,
  DHL_SERVICEPUNT_PRICES,
  DHL_THUISBEZORGD_PRICES,
  FAR_EU_FREE_SHIPPING_THRESHOLD,
  buildDhlOptionPrices,
  freeShippingThresholdForCountry,
  freeShippingThresholds,
} from "../dhl-shipping-rates"

describe("freeShippingThresholdForCountry", () => {
  it("uses the home threshold for NL/BE/DE", () => {
    expect(freeShippingThresholdForCountry("nl", 75)).toBe(75)
    expect(freeShippingThresholdForCountry("be", 75)).toBe(75)
    expect(freeShippingThresholdForCountry("de", 75)).toBe(75)
    expect(freeShippingThresholdForCountry("DE", 100)).toBe(100)
  })

  it("uses the far-EU threshold for the rest", () => {
    for (const cc of ["fr", "gb", "it", "es", "dk", "se"]) {
      expect(freeShippingThresholdForCountry(cc, 75)).toBe(FAR_EU_FREE_SHIPPING_THRESHOLD)
    }
  })
})

describe("freeShippingThresholds", () => {
  it("maps every served country to its threshold", () => {
    const map = freeShippingThresholds(75)
    expect(map).toEqual({
      nl: 75,
      be: 75,
      de: 75,
      fr: 250,
      gb: 250,
      it: 250,
      es: 250,
      dk: 250,
      se: 250,
    })
  })
})

describe("buildDhlOptionPrices", () => {
  it("includes a rule-less fallback first", () => {
    const prices = buildDhlOptionPrices(DHL_THUISBEZORGD_PRICES, 6.95, 75)
    expect(prices[0]).toEqual({ currency_code: "eur", amount: 6.95 })
    expect(prices[0].rules).toBeUndefined()
  })

  it("creates a country-ruled base price per country (equality rule)", () => {
    const prices = buildDhlOptionPrices(DHL_THUISBEZORGD_PRICES, 6.95, 75)
    const se = prices.find(
      (p) =>
        p.amount === 29.95 &&
        p.rules &&
        Object.keys(p.rules).length === 1 &&
        p.rules[COUNTRY_CODE_ATTRIBUTE] === "se",
    )
    expect(se).toBeDefined()
  })

  it("adds a EUR 0 twin per country with the right threshold when free shipping is on", () => {
    const prices = buildDhlOptionPrices(DHL_THUISBEZORGD_PRICES, 6.95, 75)
    const nlFree = prices.find(
      (p) =>
        p.amount === 0 &&
        p.rules?.[COUNTRY_CODE_ATTRIBUTE] === "nl" &&
        Array.isArray(p.rules?.item_total) &&
        p.rules.item_total[0].value === 75,
    )
    const seFree = prices.find(
      (p) =>
        p.amount === 0 &&
        p.rules?.[COUNTRY_CODE_ATTRIBUTE] === "se" &&
        Array.isArray(p.rules?.item_total) &&
        p.rules.item_total[0].value === 250,
    )
    expect(nlFree).toBeDefined()
    expect(seFree).toBeDefined()
    // fallback + 9 base + 9 twins
    expect(prices).toHaveLength(1 + 9 + 9)
  })

  it("omits all free twins when the threshold is null (off)", () => {
    const prices = buildDhlOptionPrices(DHL_THUISBEZORGD_PRICES, 6.95, null)
    expect(prices.some((p) => p.amount === 0)).toBe(false)
    // fallback + 9 base
    expect(prices).toHaveLength(1 + 9)
  })

  it("servicepunt is NL-only", () => {
    const prices = buildDhlOptionPrices(DHL_SERVICEPUNT_PRICES, 4.95, 75)
    // fallback + 1 base + 1 twin
    expect(prices).toHaveLength(3)
    expect(prices[1].rules?.[COUNTRY_CODE_ATTRIBUTE]).toBe("nl")
    expect(prices[1].amount).toBe(4.95)
  })
})
