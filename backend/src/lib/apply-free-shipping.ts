import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"
import { normalizeThreshold } from "./free-shipping-threshold"

// Composed provider id (see dhl-parcel notes): Medusa registers the provider as
// `<config-id>_<service-identifier>`, both "dhl-parcel" here.
const DHL_PROVIDER_ID = "dhl-parcel_dhl-parcel"
const ITEM_TOTAL = "item_total"

type PriceRule = {
  attribute?: string | null
  operator?: string | null
  value?: string | null
}
type Price = {
  id: string
  amount: number
  currency_code: string
  price_rules?: PriceRule[] | null
}
type ShippingOptionWithPrices = {
  id: string
  name: string
  provider_id: string
  prices?: Price[] | null
}

export type ApplyFreeShippingResult = {
  threshold: number | null
  options: Array<{ id: string; name: string; base_prices: number; free_added: number }>
}

/**
 * Sync a "free shipping over X" price onto the DHL shipping options.
 *
 * For each DHL option we keep its existing BASE prices (those WITHOUT an
 * item_total rule) and, when `threshold` is a positive number, add a €0 twin of
 * each base price carrying an `item_total >= threshold` rule. Medusa's pricing
 * engine selects the price matching the most rules, so above the threshold the
 * €0 twin (e.g. region_id + item_total = 2 rules) beats the base region price
 * (1 rule); below it, only the base price matches. A null/<=0 threshold removes
 * the free-shipping prices, restoring normal pricing.
 *
 * Only the price set is rewritten | the shipping option itself is upserted with
 * just its id, so name / data (dhl_option) / option rules are untouched.
 * Idempotent: previous item_total prices are dropped and rebuilt every run.
 */
export async function applyFreeShippingToDhlOptions(
  container: any,
  thresholdInput: unknown,
): Promise<ApplyFreeShippingResult> {
  const threshold = normalizeThreshold(thresholdInput)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "provider_id",
      "prices.id",
      "prices.amount",
      "prices.currency_code",
      "prices.price_rules.attribute",
      "prices.price_rules.operator",
      "prices.price_rules.value",
    ],
    filters: { provider_id: DHL_PROVIDER_ID },
  })

  const result: ApplyFreeShippingResult = { threshold, options: [] }

  for (const opt of (options ?? []) as ShippingOptionWithPrices[]) {
    const allPrices = opt.prices ?? []
    // BASE = the option's real prices (no item_total rule). The item_total ones
    // are our own free-shipping twins from a previous run; we rebuild them.
    const basePrices = allPrices.filter(
      (p) => !(p.price_rules ?? []).some((r) => r.attribute === ITEM_TOTAL),
    )

    const rebuilt: Array<Record<string, unknown>> = []
    for (const bp of basePrices) {
      const regionRule = (bp.price_rules ?? []).find(
        (r) => r.attribute === "region_id",
      )
      const base: Record<string, unknown> = regionRule
        ? { region_id: regionRule.value as string, amount: bp.amount }
        : { currency_code: bp.currency_code, amount: bp.amount }
      rebuilt.push(base)
      if (threshold != null) {
        rebuilt.push({
          ...base,
          amount: 0,
          rules: [
            { attribute: ITEM_TOTAL, operator: "gte", value: String(threshold) },
          ],
        })
      }
    }

    await updateShippingOptionsWorkflow(container).run({
      // Only { id, prices } | the option entity itself keeps its name/data/rules.
      input: [{ id: opt.id, prices: rebuilt } as any],
    })

    result.options.push({
      id: opt.id,
      name: opt.name,
      base_prices: basePrices.length,
      free_added: threshold != null ? basePrices.length : 0,
    })
  }

  return result
}
