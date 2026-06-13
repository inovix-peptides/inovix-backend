import type { MedusaRequest, MedusaResponse } from '@medusajs/framework'
import { normalizeThreshold } from '../../../lib/free-shipping-threshold'
import {
  DEFAULT_HOME_FREE_SHIPPING_THRESHOLD,
  freeShippingThresholds,
} from '../../../lib/dhl-shipping-rates'

/**
 * GET /store/free-shipping
 *
 * Public (publishable-key) endpoint that tells the storefront the active
 * free-shipping thresholds so it can show "free shipping over EUR X" messaging.
 * Returns `{ free_shipping: { threshold, thresholds, currency_code } }` where
 * `threshold` is the home (NL/BE/DE) threshold and `thresholds` is the
 * per-country map (far-EU countries have a higher threshold). `threshold: null`
 * means free shipping is off everywhere.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service = req.scope.resolve('dhl_parcel_settings') as any
  const rows: Array<{ free_shipping_threshold?: string | null }> =
    await service.listDhlParcelSettings({})

  const homeThreshold = normalizeThreshold(rows[0]?.free_shipping_threshold)

  res.json({
    free_shipping: {
      threshold: homeThreshold,
      thresholds:
        homeThreshold == null
          ? null
          : freeShippingThresholds(homeThreshold ?? DEFAULT_HOME_FREE_SHIPPING_THRESHOLD),
      currency_code: 'eur',
    },
  })
}
