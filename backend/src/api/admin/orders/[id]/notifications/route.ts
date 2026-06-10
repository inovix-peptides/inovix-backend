import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"

// Lists the emails sent for this order (so admins can SEE what went out) and
// lets them re-send a specific one. Notifications aren't directly linked to
// orders, so we match on the order's email address.

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const orderId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const notificationService: any = req.scope.resolve(Modules.NOTIFICATION)

  const { data: orders } = await query.graph({
    entity: "order",
    filters: { id: orderId },
    fields: ["id", "email"],
  })
  const email = orders?.[0]?.email
  if (!email) {
    res.json({ notifications: [], email: null })
    return
  }

  const notifications: any[] = await notificationService.listNotifications(
    { to: email },
    { take: 100, order: { created_at: "DESC" } }
  )

  res.json({
    email,
    notifications: notifications.map((n) => ({
      id: n.id,
      template: n.template,
      to: n.to,
      status: n.status ?? null,
      created_at: n.created_at,
      idempotency_key: n.idempotency_key ?? null,
    })),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const orderId = req.params.id
  const logger = req.scope.resolve("logger") as Logger
  const notificationService: any = req.scope.resolve(Modules.NOTIFICATION)

  const body = (req.body ?? {}) as { notification_id?: string }
  if (!body.notification_id) {
    res.status(400).json({ message: "notification_id is verplicht" })
    return
  }

  const [orig] = await notificationService.listNotifications({ id: body.notification_id })
  if (!orig) {
    res.status(404).json({ message: "E-mail niet gevonden" })
    return
  }

  try {
    // Re-send with a UNIQUE idempotency key. The original static key would make
    // the notification module skip an already-sent email; a fresh key forces a
    // real re-send of the same template + data to the same recipient.
    await notificationService.createNotifications({
      to: orig.to,
      channel: orig.channel ?? "email",
      template: orig.template,
      data: orig.data ?? {},
      idempotency_key: `${orig.idempotency_key ?? orig.id}-resend-${Date.now()}`,
    })
    logger.info(
      `admin.order-notifications: re-sent ${orig.template} to ${orig.to} for order ${orderId}`
    )
    res.json({ sent: true })
  } catch (err: any) {
    logger.error(
      `admin.order-notifications: resend failed for order ${orderId}: ${(err as Error).message}`
    )
    res.status(500).json({ message: "Opnieuw versturen mislukt" })
  }
}
