// Single source of truth for DHL destination-country shipping prices and the
// per-country free-shipping thresholds. Framework-free so it can be unit-tested
// and shared by the price-sync helper, the store endpoint and scripts.
//
// Prices set from the DHL rate sheet (account 08035926) per the operator's
// 2026-06-13 decision: charge the realistic-max parcel band per country (S for
// NL, M for BE, the 0-2 kg band for the rest of the EU), rounded up to the next
// .95 to absorb the fuel/peak surcharges DHL bills on top (the sheet is "excl.
// toeslagen en BTW"). Amounts are in EUR, tax-inclusive at the storefront.
//
// Free shipping: NL/BE/DE over the configurable "home" threshold (default 75);
// every other country over FAR_EU_FREE_SHIPPING_THRESHOLD, because a far-EU
// parcel costs 15-30 EUR and a low threshold there is loss-making.

// dhl_option values carried in shipping_option.data.
export const DHL_OPTION_DOOR = "DOOR"
export const DHL_OPTION_SERVICEPOINT = "PS"

// The price rule attribute the pricing engine flattens the cart's destination
// country to (cart.shipping_address.country_code -> "shipping_address.country_code").
export const COUNTRY_CODE_ATTRIBUTE = "shipping_address.country_code"
export const ITEM_TOTAL_ATTRIBUTE = "item_total"

export const HOME_FREE_SHIPPING_COUNTRIES = ["nl", "be", "de"] as const
export const FAR_EU_FREE_SHIPPING_THRESHOLD = 250
export const DEFAULT_HOME_FREE_SHIPPING_THRESHOLD = 75

// DHL Thuisbezorgd (DOOR), per ISO-2 (lowercase) destination country.
export const DHL_THUISBEZORGD_PRICES: Record<string, number> = {
  nl: 6.95,
  be: 10.95,
  de: 13.95,
  fr: 15.95,
  gb: 18.95,
  it: 20.95,
  es: 22.95,
  dk: 28.95,
  se: 29.95,
}

// DHL Servicepunt (PS) is offered in NL only (the storefront filters it out
// elsewhere), so it carries a single NL price.
export const DHL_SERVICEPUNT_PRICES: Record<string, number> = {
  nl: 4.95,
}

// Rule-less fallback amounts. A price with NO rules always matches, so the
// option ALWAYS resolves a price even if country-rule matching ever misbehaves
// | checkout never breaks. Per-country rules (1+ rules) always beat this
// 0-rule price for in-zone countries, so it is purely a safety net. Set to the
// NL home price so the degraded mode never overcharges the main market.
export const DHL_THUISBEZORGD_FALLBACK = 6.95
export const DHL_SERVICEPUNT_FALLBACK = 4.95

function isHomeCountry(countryCode: string): boolean {
  return (HOME_FREE_SHIPPING_COUNTRIES as readonly string[]).includes(
    countryCode.toLowerCase(),
  )
}

/**
 * Free-shipping threshold for a destination country given the configured home
 * threshold. Home countries (NL/BE/DE) use `homeThreshold`; everything else the
 * far-EU threshold.
 */
export function freeShippingThresholdForCountry(
  countryCode: string,
  homeThreshold: number,
): number {
  return isHomeCountry(countryCode) ? homeThreshold : FAR_EU_FREE_SHIPPING_THRESHOLD
}

/**
 * Per-country free-shipping threshold map for the 9 served countries, used by
 * the storefront to show the right "free over EUR X" message per destination.
 */
export function freeShippingThresholds(homeThreshold: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const cc of Object.keys(DHL_THUISBEZORGD_PRICES)) {
    out[cc] = freeShippingThresholdForCountry(cc, homeThreshold)
  }
  return out
}

// Pricing-module rule shape: a bare value is an EQUALITY rule (like region_id);
// an array of {operator, value} is an operator rule (value MUST be numeric).
export type PriceRules = Record<string, string | Array<{ operator: string; value: number }>>
export type ShippingPriceInput = {
  currency_code: string
  amount: number
  rules?: PriceRules
}

/**
 * Build the full price list for one DHL option: a rule-less fallback, then a
 * per-country base price (country_code = cc), and | when free shipping is on |
 * a EUR 0 twin per country carrying the country rule plus an
 * `item_total >= threshold` rule. The pricing engine selects the price matching
 * the MOST rules, so above the threshold the 2-rule twin beats the 1-rule base.
 *
 * The country rule is an equality rule (bare value), matching how the engine
 * already stores region_id. `homeThreshold` null = free shipping OFF (no twins);
 * otherwise NL/BE/DE use it and the far-EU countries use the far-EU threshold.
 */
export function buildDhlOptionPrices(
  priceMap: Record<string, number>,
  fallback: number,
  homeThreshold: number | null,
): ShippingPriceInput[] {
  const prices: ShippingPriceInput[] = [{ currency_code: "eur", amount: fallback }]

  for (const [cc, amount] of Object.entries(priceMap)) {
    prices.push({
      currency_code: "eur",
      amount,
      rules: { [COUNTRY_CODE_ATTRIBUTE]: cc },
    })
    if (homeThreshold != null) {
      prices.push({
        currency_code: "eur",
        amount: 0,
        rules: {
          [COUNTRY_CODE_ATTRIBUTE]: cc,
          // operator-rule values must be NUMBERS.
          [ITEM_TOTAL_ATTRIBUTE]: [
            { operator: "gte", value: freeShippingThresholdForCountry(cc, homeThreshold) },
          ],
        },
      })
    }
  }

  return prices
}
