import type { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import { normalizeThreshold } from '../../../lib/free-shipping-threshold'

/**
 * GET /store/free-shipping
 *
 * Public (publishable-key) endpoint that tells the storefront the active
 * free-shipping threshold so it can show "free shipping over EUR X" messaging.
 * Returns `{ free_shipping: { threshold: number | null, currency_code } }`.
 * `threshold: null` means free shipping is off.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service = req.scope.resolve('dhl_parcel_settings') as any
  const rows: Array<{ free_shipping_threshold?: string | null }> =
    await service.listDhlParcelSettings({})

  const threshold = normalizeThreshold(rows[0]?.free_shipping_threshold)

  res.json({
    free_shipping: {
      threshold,
      currency_code: 'eur',
    },
  })
}
