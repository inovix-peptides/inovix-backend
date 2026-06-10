import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import { sendOrderShippedNotification } from "../../../../../../subscribers/_helpers/send-order-shipped"

const ORDER_FIELDS = [
  "id",
  "email",
  "items.id",
  "items.detail.fulfilled_quantity",
  "items.detail.shipped_quantity",
  "fulfillments.id",
  "fulfillments.provider_id",
  "fulfillments.canceled_at",
  "fulfillments.shipped_at",
  "fulfillments.data",
  "fulfillments.labels.tracking_number",
  "fulfillments.labels.tracking_url",
  "fulfillments.labels.label_url",
]

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const orderId = req.params.id
  const logger = req.scope.resolve("logger") as Logger
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const orderService: any = req.scope.resolve(Modules.ORDER)
  const fulfillmentService: any = req.scope.resolve(Modules.FULFILLMENT)

  // 1. Load the order with fulfillments + items.
  let orders: any[]
  try {
    const result = await query.graph({
      entity: "order",
      filters: { id: orderId },
      fields: ORDER_FIELDS,
    })
    orders = result.data ?? []
  } catch (err: any) {
    if (MedusaError.isMedusaError(err) && err.type === MedusaError.Types.NOT_FOUND) {
      res.status(404).json({ message: `Order ${orderId} not found` })
      return
    }
    logger.error(
      `admin.dhl-label.send-email: failed to load order ${orderId}: ${(err as Error).message}`
    )
    res.status(500).json({ message: "Failed to load order" })
    return
  }

  const order = orders?.[0]
  if (!order) {
    res.status(404).json({ message: `Order ${orderId} not found` })
    return
  }

  // 2. Find the DHL Parcel fulfillment. The provider is registered under the
  //    COMPOSED id `dhl-parcel_dhl-parcel`, so the old `=== 'dhl-parcel'` check
  //    never matched; identify it by the composed id OR the dhl_tracking_number
  //    our provider writes onto data / the label.
  const fulfillments: any[] = order.fulfillments ?? []
  const dhlFulfillment = fulfillments.find((f: any) => {
    if (f.canceled_at) return false
    const trackingFromData = typeof f.data?.dhl_tracking_number === "string"
    const trackingFromLabel = (f.labels ?? []).some(
      (l: any) => l.tracking_number != null && l.tracking_number !== ""
    )
    const isDhl = f.provider_id === "dhl-parcel_dhl-parcel" || trackingFromData
    return isDhl && (trackingFromData || trackingFromLabel)
  })

  if (!dhlFulfillment) {
    res.status(400).json({
      message: "Geen DHL-label met tracking gevonden voor deze bestelling",
    })
    return
  }

  // 3. Mark the order shipped (idempotent): set shipped_at on the fulfillment so
  //    the order's aggregate fulfillment_status becomes "shipped", and register
  //    the shipment on the order. Best-effort | if it fails we still send the
  //    mail (the operator can mark shipped natively), but we log it.
  if (!dhlFulfillment.shipped_at) {
    try {
      await fulfillmentService.updateFulfillment(dhlFulfillment.id, { shipped_at: new Date() })
      const shipItems = (order.items ?? [])
        .map((i: any) => ({
          id: i.id,
          quantity: Number(i.detail?.fulfilled_quantity ?? 0) - Number(i.detail?.shipped_quantity ?? 0),
        }))
        .filter((i: any) => i.quantity > 0)
      if (shipItems.length > 0) {
        await orderService.registerShipment({ order_id: orderId, items: shipItems })
      }
      logger.info(`admin.dhl-label.send-email: marked order ${orderId} as shipped`)
    } catch (err: any) {
      logger.warn(
        `admin.dhl-label.send-email: could not mark order ${orderId} shipped (continuing to email): ${(err as Error).message}`
      )
    }
  }

  // 4. Send the shipped email (idempotency-keyed in the helper, so re-sending or
  //    a parallel native shipment event will not double-send).
  try {
    await sendOrderShippedNotification(req.scope, dhlFulfillment.id)

    logger.info(
      `admin.dhl-label.send-email: shipped email sent for fulfillment ${dhlFulfillment.id} on order ${orderId}`
    )

    res.status(200).json({ sent: true })
  } catch (err: any) {
    if (MedusaError.isMedusaError(err)) {
      const status =
        err.type === MedusaError.Types.NOT_FOUND ? 404
        : err.type === MedusaError.Types.NOT_ALLOWED ? 400
        : err.type === MedusaError.Types.INVALID_DATA ? 400
        : 500

      logger.warn(
        `admin.dhl-label.send-email: validation error for order ${orderId}: [${err.type}] ${err.message}`
      )
      res.status(status).json({ message: err.message })
      return
    }

    logger.error(
      `admin.dhl-label.send-email: unexpected error for order ${orderId}: ${(err as Error).message}`
    )
    res.status(500).json({ message: "Failed to send shipped email" })
  }
}
