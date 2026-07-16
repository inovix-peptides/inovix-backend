import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import type { Logger } from "@medusajs/framework/types"

import { listOrderEmails, resendOrderEmail } from "../../../../../lib/order-notifications"

// Sent-email visibility + resend. Logic lives in lib/order-notifications.ts,
// shared with the Telegram bot's Emails view; this route only maps to HTTP.

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const result = await listOrderEmails(req.scope, req.params.id)
  res.json(result)
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const orderId = req.params.id
  const logger = req.scope.resolve("logger") as Logger

  const body = (req.body ?? {}) as { notification_id?: string }
  if (!body.notification_id) {
    res.status(400).json({ message: "notification_id is verplicht" })
    return
  }

  const r = await resendOrderEmail(req.scope, body.notification_id)
  if (r.ok) {
    logger.info(
      `admin.order-notifications: re-sent ${r.template} to ${r.to} for order ${orderId}`
    )
    res.json({ sent: true })
    return
  }
  // Non-strict tsconfig breaks negative-branch union narrowing.
  const failure = r as { reason?: string; message?: string }
  if (failure.reason === "not_found") {
    res.status(404).json({ message: "E-mail niet gevonden" })
    return
  }
  logger.error(
    `admin.order-notifications: resend failed for order ${orderId}: ${failure.message ?? "unknown"}`
  )
  res.status(500).json({ message: "Opnieuw versturen mislukt" })
}
