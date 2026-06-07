import { ExecArgs } from "@medusajs/framework/types"
import { DHL_PARCEL_SHIPPER } from "../lib/constants"
import { applyFreeShippingToDhlOptions } from "../lib/apply-free-shipping"
import { normalizeThreshold } from "../lib/free-shipping-threshold"

/**
 * One-off / repeatable apply of the free-shipping threshold against an
 * environment where the admin PUT cannot be reached (e.g. initial prod setup).
 *
 *   medusa exec ./src/scripts/apply-free-shipping.ts 75     # free over EUR 75
 *   medusa exec ./src/scripts/apply-free-shipping.ts off    # disable
 *
 * Persists the threshold on the dhl_parcel_settings singleton (so the admin UI
 * and storefront read it) and syncs the conditional EUR 0 price on the DHL
 * options. Defaults to 75 when no arg is given.
 */
export default async function applyFreeShipping({ container, args }: ExecArgs) {
  const logger = container.resolve("logger")

  const rawArg = (args?.[0] ?? "75").trim()
  const threshold = rawArg.toLowerCase() === "off" ? null : normalizeThreshold(rawArg)

  if (rawArg.toLowerCase() !== "off" && threshold == null) {
    logger.error(
      `Invalid threshold "${rawArg}". Pass a positive number (e.g. 75) or "off".`,
    )
    return
  }

  // 1. Persist on the settings singleton (create from env defaults if absent;
  //    the shipper_* columns are NOT NULL so a bare row cannot be created).
  const service = container.resolve("dhl_parcel_settings") as any
  const rows = await service.listDhlParcelSettings({})
  const thresholdText = threshold != null ? String(threshold) : null

  if (rows.length > 0) {
    await service.updateDhlParcelSettings(
      { id: rows[0].id },
      { free_shipping_threshold: thresholdText },
    )
    logger.info(`Updated dhl_parcel_settings.free_shipping_threshold = ${thresholdText}`)
  } else {
    await service.createDhlParcelSettings({
      shipper_name: DHL_PARCEL_SHIPPER.name,
      shipper_street: DHL_PARCEL_SHIPPER.street,
      shipper_number: null,
      shipper_postal_code: DHL_PARCEL_SHIPPER.postalCode,
      shipper_city: DHL_PARCEL_SHIPPER.city,
      shipper_country_code: DHL_PARCEL_SHIPPER.countryCode,
      shipper_phone: DHL_PARCEL_SHIPPER.phone,
      shipper_email: DHL_PARCEL_SHIPPER.email,
      free_shipping_threshold: thresholdText,
    })
    logger.info(`Created dhl_parcel_settings with free_shipping_threshold = ${thresholdText}`)
  }

  // 2. Sync the price rule on the DHL shipping options.
  const result = await applyFreeShippingToDhlOptions(container, threshold)
  logger.info(
    `Free-shipping price sync done: threshold=${result.threshold}, options=${JSON.stringify(result.options)}`,
  )
}
