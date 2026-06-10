import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import type { Logger } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { buildPaymentView } from "../../../../../admin/widgets/order-payment-broker.logic"
import { resolveBrokerPayment, fetchBrokerLive } from "./resolve"

// Returns the live payment view for an order's broker payment: status pulled
// live from the broker (Mollie) merged with Medusa's own captured/refunded
// totals and refund history. Degrades gracefully (broker_unavailable) instead
// of erroring when the broker can't be reached.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const orderId = req.params.id
  if (!orderId) {
    res.status(400).json({ error: "order id is required" })
    return
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Logger
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const payment = await resolveBrokerPayment(query, orderId)
  if (!payment) {
    res.status(404).json({ error: "no broker payment found for this order" })
    return
  }

  const ref = payment.data?.ref ?? null
  const broker = ref ? await fetchBrokerLive(ref, { logger }) : null

  res.status(200).json({ payment: buildPaymentView(payment, broker) })
}
