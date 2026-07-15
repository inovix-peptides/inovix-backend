import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import {
  fetchDhlTracking,
  mapDhlTracking,
  type TrackingView,
} from "../../../../../lib/dhl-tracking"
import { findShippableDhlFulfillment } from "../../../../../lib/mark-dhl-shipped"

// GET /admin/orders/:id/dhl-tracking | the parcel's live journey from DHL's
// public track-trace API, mapped to Dutch. The widget polls this every
// minute, so responses are cached in-process per barcode for 60s to keep the
// DHL calls bounded.
const ORDER_FIELDS = [
  "id",
  "shipping_address.postal_code",
  "fulfillments.id",
  "fulfillments.provider_id",
  "fulfillments.canceled_at",
  "fulfillments.shipped_at",
  "fulfillments.data",
  "fulfillments.labels.tracking_number",
  "fulfillments.labels.tracking_url",
]

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { at: number; view: TrackingView | null }>()

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const orderId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "order",
    filters: { id: orderId },
    fields: ORDER_FIELDS,
  })
  const order = (data?.[0] ?? null) as any
  if (!order) {
    res.status(404).json({ message: `Order ${orderId} not found` })
    return
  }

  const fulfillment = findShippableDhlFulfillment(order)
  const trackingNumber: string | null =
    fulfillment?.data?.dhl_tracking_number ??
    fulfillment?.labels?.[0]?.tracking_number ??
    null
  const trackingUrl: string | null =
    fulfillment?.data?.dhl_shipment_tracking_url ??
    fulfillment?.labels?.[0]?.tracking_url ??
    null

  if (!trackingNumber) {
    res.status(200).json({ tracking: null, tracking_number: null, tracking_url: null })
    return
  }

  const cached = cache.get(trackingNumber)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    res.status(200).json({
      tracking: cached.view,
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      cached: true,
    })
    return
  }

  const raw = await fetchDhlTracking(trackingNumber, order.shipping_address?.postal_code)
  const view = raw ? mapDhlTracking(raw) : null
  cache.set(trackingNumber, { at: Date.now(), view })

  res.status(200).json({
    tracking: view,
    tracking_number: trackingNumber,
    tracking_url: trackingUrl,
  })
}
