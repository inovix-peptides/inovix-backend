import {
  ContainerRegistrationKeys,
  LINKS,
  Modules,
} from "@medusajs/framework/utils"
import { normalizeThreshold } from "./free-shipping-threshold"
import {
  DHL_OPTION_SERVICEPOINT,
  DHL_SERVICEPUNT_FALLBACK,
  DHL_SERVICEPUNT_PRICES,
  DHL_THUISBEZORGD_FALLBACK,
  DHL_THUISBEZORGD_PRICES,
  buildDhlOptionPrices,
} from "./dhl-shipping-rates"

// Composed provider id (see dhl-parcel notes): Medusa registers the provider as
// `<config-id>_<service-identifier>`, both "dhl-parcel" here.
const DHL_PROVIDER_ID = "dhl-parcel_dhl-parcel"

type ShippingOption = {
  id: string
  name: string
  provider_id: string
  data?: { dhl_option?: string } | null
}

export type ApplyFreeShippingResult = {
  threshold: number | null
  options: Array<{ id: string; name: string; prices: number }>
}

/**
 * Rebuild the DHL shipping options' prices from the single source of truth in
 * `dhl-shipping-rates.ts`: per-country base prices (keyed on the destination
 * `shipping_address.country_code`) plus, when free shipping is on, a EUR 0 twin
 * per country carrying an `item_total >= threshold` rule.
 *
 * `thresholdInput` is the HOME (NL/BE/DE) free-shipping threshold the admin
 * panel / settings expose; the far-EU threshold is fixed in the config. A
 * null/<=0/"off" value turns free shipping off entirely (base prices only).
 *
 * Prices are written straight onto each option's price set with
 * `pricing.updatePriceSets` (a full replace, idempotent). We bypass
 * `updateShippingOptionsWorkflow` because its price builder only emits
 * operator-array rules, which the pricing module rejects for the non-numeric
 * country equality rule | equality rules must be a bare value.
 */
export async function applyFreeShippingToDhlOptions(
  container: any,
  thresholdInput: unknown,
): Promise<ApplyFreeShippingResult> {
  const homeThreshold = normalizeThreshold(thresholdInput)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteQuery = container.resolve(ContainerRegistrationKeys.REMOTE_QUERY)
  const pricing = container.resolve(Modules.PRICING)

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "provider_id", "data"],
    filters: { provider_id: DHL_PROVIDER_ID },
  })

  const optionList = (options ?? []) as ShippingOption[]

  // Resolve each option's price set via the shipping-option <-> price-set link.
  const links: Array<{ shipping_option_id: string; price_set_id: string }> =
    optionList.length === 0
      ? []
      : await remoteQuery({
          service: LINKS.ShippingOptionPriceSet,
          variables: { filters: { shipping_option_id: optionList.map((o) => o.id) } },
          fields: ["shipping_option_id", "price_set_id"],
        })
  const priceSetByOption = new Map(
    links.map((l) => [l.shipping_option_id, l.price_set_id]),
  )

  const result: ApplyFreeShippingResult = { threshold: homeThreshold, options: [] }

  for (const opt of optionList) {
    const priceSetId = priceSetByOption.get(opt.id)
    if (!priceSetId) continue

    const isServicepoint = opt.data?.dhl_option === DHL_OPTION_SERVICEPOINT
    const prices = isServicepoint
      ? buildDhlOptionPrices(DHL_SERVICEPUNT_PRICES, DHL_SERVICEPUNT_FALLBACK, homeThreshold)
      : buildDhlOptionPrices(DHL_THUISBEZORGD_PRICES, DHL_THUISBEZORGD_FALLBACK, homeThreshold)

    await pricing.updatePriceSets(priceSetId, { prices: prices as any })

    result.options.push({ id: opt.id, name: opt.name, prices: prices.length })
  }

  return result
}
