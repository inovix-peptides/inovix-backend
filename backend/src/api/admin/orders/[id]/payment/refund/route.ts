import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import type { Logger } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { refundPaymentWorkflow } from "@medusajs/core-flows"

import {
  buildPaymentView,
  computeRemainingRefundable,
  toAmount,
  validateRefundAmount,
} from "../../../../../../admin/widgets/order-payment-broker.logic"
import { resolveBrokerPayment, fetchBrokerLive } from "../resolve"

type RefundBody = { amount?: unknown; note?: unknown }

// Issues a refund against an order's broker payment. The refund runs through
// Medusa's native refundPaymentWorkflow so it is recorded on the Medusa payment
// AND routed via the broker provider to Mollie | one path, consistent records.
// Only amount/currency cross the wire to the broker; nothing Inovix-identifying.
export async function POST(
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

  const body = (req.body ?? {}) as RefundBody
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount)
  const remaining = computeRemainingRefundable(
    toAmount(payment.captured_amount),
    toAmount(payment.refunded_amount)
  )
  const check = validateRefundAmount(amount, remaining)
  if (!check.ok) {
    res.status(400).json({ error: check.error })
    return
  }

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined
  const actorId = (req as MedusaRequest & { auth_context?: { actor_id?: string } })
    .auth_context?.actor_id

  try {
    await refundPaymentWorkflow(req.scope).run({
      input: {
        payment_id: payment.id,
        amount,
        ...(note ? { note } : {}),
        ...(actorId ? { created_by: actorId } : {}),
      },
    })
  } catch (err) {
    logger.error(
      `[admin payment] refund failed for order ${orderId} payment ${payment.id}: ${(err as Error).message}`
    )
    res.status(500).json({ error: "refund failed" })
    return
  }

  // Re-read so the widget shows the updated refunded total without a round trip.
  const fresh = (await resolveBrokerPayment(query, orderId)) ?? payment
  const ref = fresh.data?.ref ?? null
  const broker = ref ? await fetchBrokerLive(ref, { logger }) : null
  res.status(200).json({ payment: buildPaymentView(fresh, broker) })
}
