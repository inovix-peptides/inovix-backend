import type { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import type { Logger } from '@medusajs/framework/types'
import { DHL_PARCEL_SHIPPER } from '../../../lib/constants'
import { applyFreeShippingToDhlOptions } from '../../../lib/apply-free-shipping'
import { normalizeThreshold } from '../../../lib/free-shipping-threshold'
import { validateShipperSettings } from './validate'

// Infer the shape of a persisted settings row
type SettingsRow = {
  id: string
  shipper_name: string
  shipper_street: string
  shipper_number: string | null
  shipper_postal_code: string
  shipper_city: string
  shipper_country_code: string
  shipper_phone: string
  shipper_email: string
  free_shipping_threshold: string | null
}

/**
 * GET /admin/dhl-parcel-settings
 *
 * Returns the singleton settings row if one exists in the DB, otherwise
 * returns the env-default values from DHL_PARCEL_SHIPPER (so the admin form
 * is pre-filled on first visit). The `persisted` flag tells the UI whether
 * the values are DB-saved or just env defaults.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service = req.scope.resolve('dhl_parcel_settings') as any
  const rows: SettingsRow[] = await service.listDhlParcelSettings({})

  if (rows.length > 0) {
    return res.json({ dhl_parcel_settings: rows[0], persisted: true })
  }

  // No DB row: return env defaults so the form is pre-filled
  const envDefaults = {
    id: null,
    shipper_name: DHL_PARCEL_SHIPPER.name,
    shipper_street: DHL_PARCEL_SHIPPER.street,
    shipper_number: null,
    shipper_postal_code: DHL_PARCEL_SHIPPER.postalCode,
    shipper_city: DHL_PARCEL_SHIPPER.city,
    shipper_country_code: DHL_PARCEL_SHIPPER.countryCode,
    shipper_phone: DHL_PARCEL_SHIPPER.phone,
    shipper_email: DHL_PARCEL_SHIPPER.email,
    free_shipping_threshold: null,
  }

  return res.json({ dhl_parcel_settings: envDefaults, persisted: false })
}

/**
 * PUT /admin/dhl-parcel-settings
 *
 * Upserts the singleton: updates if a row exists, creates one otherwise.
 * Validates the body before touching the DB.
 */
export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = req.body as Record<string, unknown>
  const errors = validateShipperSettings(body)
  if (errors.length > 0) {
    return res.status(400).json({ message: 'Validation failed', errors })
  }

  const service = req.scope.resolve('dhl_parcel_settings') as any
  const existing: SettingsRow[] = await service.listDhlParcelSettings({})

  // Normalize the threshold to a clean number (or null = off) and persist it as
  // text, matching the model column.
  const threshold = normalizeThreshold(body.free_shipping_threshold)

  const payload = {
    shipper_name: body.shipper_name,
    shipper_street: body.shipper_street,
    shipper_number: body.shipper_number ?? null,
    shipper_postal_code: body.shipper_postal_code,
    shipper_city: body.shipper_city,
    shipper_country_code: body.shipper_country_code,
    shipper_phone: body.shipper_phone,
    shipper_email: body.shipper_email,
    free_shipping_threshold: threshold != null ? String(threshold) : null,
  }

  let saved: SettingsRow
  if (existing.length > 0) {
    // Medusa's generated update takes a SINGLE object with the id merged in
    // (update(data, sharedContext)); a separate (selector, data) call silently
    // updates nothing because the 2nd arg is treated as the shared context.
    saved = await service.updateDhlParcelSettings({
      id: existing[0].id,
      ...payload,
    })
  } else {
    saved = await service.createDhlParcelSettings(payload)
  }

  // Sync the conditional €0 shipping price onto the DHL options. Saved already,
  // so if this fails we still report the saved row plus the error (re-saving
  // retries the sync).
  try {
    const freeShipping = await applyFreeShippingToDhlOptions(
      req.scope,
      threshold,
    )
    return res.json({ dhl_parcel_settings: saved, free_shipping: freeShipping })
  } catch (err) {
    const logger = req.scope.resolve('logger') as Logger
    logger.error(
      `dhl-parcel-settings: saved threshold but failed to apply free-shipping price: ${(err as Error).message}`,
    )
    return res.status(500).json({
      dhl_parcel_settings: saved,
      free_shipping_error: (err as Error).message,
    })
  }
}
