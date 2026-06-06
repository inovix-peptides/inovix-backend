import type { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import { DHL_PARCEL_SHIPPER } from '../../../lib/constants'
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

  const payload = {
    shipper_name: body.shipper_name,
    shipper_street: body.shipper_street,
    shipper_number: body.shipper_number ?? null,
    shipper_postal_code: body.shipper_postal_code,
    shipper_city: body.shipper_city,
    shipper_country_code: body.shipper_country_code,
    shipper_phone: body.shipper_phone,
    shipper_email: body.shipper_email,
  }

  let saved: SettingsRow
  if (existing.length > 0) {
    saved = await service.updateDhlParcelSettings(
      { id: existing[0].id },
      payload,
    )
  } else {
    saved = await service.createDhlParcelSettings(payload)
  }

  return res.json({ dhl_parcel_settings: saved })
}
