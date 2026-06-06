import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import { sendOrderShippedNotification } from "../../../../../../subscribers/_helpers/send-order-shipped"

const ORDER_FIELDS = [
  "id",
  "email",
  "fulfillments.id",
  "fulfillments.provider_id",
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

  // 1. Load the order with fulfillments and labels.
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

  // 2. Find the DHL Parcel fulfillment: provider_id === 'dhl-parcel' with a label
  //    that has a tracking_number.
  const fulfillments: any[] = order.fulfillments ?? []
  const dhlFulfillment = fulfillments.find(
    (f: any) =>
      f.provider_id === 'dhl-parcel' &&
      (f.labels ?? []).some(
        (l: any) => l.tracking_number != null && l.tracking_number !== ''
      )
  )

  if (!dhlFulfillment) {
    res.status(400).json({
      message: 'Geen DHL-label met tracking gevonden voor deze bestelling',
    })
    return
  }

  // 3. Send the shipped email via the shared helper.
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
