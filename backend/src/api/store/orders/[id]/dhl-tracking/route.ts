import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import {
  fetchDhlTracking,
  mapDhlTracking,
  type TrackingView,
} from "../../../../../lib/dhl-tracking"
import { findShippableDhlFulfillment } from "../../../../../lib/mark-dhl-shipped"

// GET /store/orders/:id/dhl-tracking | the customer's live parcel journey.
// Auth: customer session/bearer (enforced in middlewares.ts); the order must
// belong to the logged-in customer or we answer 404 (indistinguishable from
// "no such order", so order ids cannot be probed).
const ORDER_FIELDS = [
  "id",
  "customer_id",
  "shipping_address.postal_code",
  "shipping_methods.data",
  "fulfillments.id",
  "fulfillments.provider_id",
  "fulfillments.canceled_at",
  "fulfillments.packed_at",
  "fulfillments.shipped_at",
  "fulfillments.data",
  "fulfillments.labels.tracking_number",
  "fulfillments.labels.tracking_url",
]

// The four stages the account page's progress bar shows.
export type CustomerTrackingStage = "besteld" | "verpakt" | "onderweg" | "bezorgd"

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { at: number; view: TrackingView | null }>()

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const orderId = req.params.id
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Niet ingelogd" })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    filters: { id: orderId },
    fields: ORDER_FIELDS,
  })
  const order = (data?.[0] ?? null) as any
  if (!order || order.customer_id !== customerId) {
    res.status(404).json({ message: "Bestelling niet gevonden" })
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

  let view: TrackingView | null = null
  if (trackingNumber) {
    const cached = cache.get(trackingNumber)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      view = cached.view
    } else {
      const raw = await fetchDhlTracking(
        trackingNumber,
        order.shipping_address?.postal_code
      )
      view = raw ? mapDhlTracking(raw) : null
      cache.set(trackingNumber, { at: Date.now(), view })
    }
  }

  const packed = Boolean(fulfillment?.packed_at)
  const shipped = Boolean(fulfillment?.shipped_at)
  const stage: CustomerTrackingStage =
    view?.phase === "bezorgd"
      ? "bezorgd"
      : view?.handed_to_dhl || shipped
        ? "onderweg"
        : packed
          ? "verpakt"
          : "besteld"

  const servicePoint =
    ((order.shipping_methods ?? []) as any[])
      .map((m) => m?.data ?? {})
      .find((d) => typeof d.service_point_name === "string")?.service_point_name ??
    null

  res.status(200).json({
    stage,
    tracking: view,
    tracking_url: trackingUrl,
    tracking_number: trackingNumber,
    postal_code: order.shipping_address?.postal_code ?? null,
    service_point: servicePoint,
    delivered_at: view?.delivered_at ?? null,
  })
}
