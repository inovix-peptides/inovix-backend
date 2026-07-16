import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

// Sent-email visibility + resend for one order, shared by the admin
// notifications route and the Telegram bot. Notifications are not directly
// linked to orders, so we match on the order's email address (same approach
// the admin widget has used since the DHL work).

export type OrderEmail = {
  id: string
  template: string
  to: string
  status: string | null
  created_at: string | Date | null
  idempotency_key: string | null
}

export async function listOrderEmails(
  container: MedusaContainer,
  orderId: string
): Promise<{ email: string | null; notifications: OrderEmail[] }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationService: any = container.resolve(Modules.NOTIFICATION)

  const { data: orders } = await query.graph({
    entity: "order",
    filters: { id: orderId },
    fields: ["id", "email"],
  })
  const email = orders?.[0]?.email
  if (!email) return { email: null, notifications: [] }

  const notifications: any[] = await notificationService.listNotifications(
    { to: email },
    { take: 100, order: { created_at: "DESC" } }
  )
  return {
    email,
    notifications: notifications.map((n) => ({
      id: n.id,
      template: n.template,
      to: n.to,
      status: n.status ?? null,
      created_at: n.created_at ?? null,
      idempotency_key: n.idempotency_key ?? null,
    })),
  }
}

export async function getNotification(
  container: MedusaContainer,
  notificationId: string
): Promise<OrderEmail | null> {
  const notificationService: any = container.resolve(Modules.NOTIFICATION)
  const [n] = await notificationService.listNotifications({ id: notificationId })
  if (!n) return null
  return {
    id: n.id,
    template: n.template,
    to: n.to,
    status: n.status ?? null,
    created_at: n.created_at ?? null,
    idempotency_key: n.idempotency_key ?? null,
  }
}

export type ResendResult = { ok: true; template: string; to: string } | { ok: false; reason: "not_found" | "error"; message?: string }

// Re-send with a UNIQUE idempotency key. The original static key would make
// the notification module skip an already-sent email; a fresh key forces a
// real re-send of the same template + data to the same recipient.
export async function resendOrderEmail(
  container: MedusaContainer,
  notificationId: string
): Promise<ResendResult> {
  const notificationService: any = container.resolve(Modules.NOTIFICATION)
  const [orig] = await notificationService.listNotifications({ id: notificationId })
  if (!orig) return { ok: false, reason: "not_found" }
  try {
    await notificationService.createNotifications({
      to: orig.to,
      channel: orig.channel ?? "email",
      template: orig.template,
      data: orig.data ?? {},
      idempotency_key: `${orig.idempotency_key ?? orig.id}-resend-${Date.now()}`,
    })
    return { ok: true, template: orig.template, to: orig.to }
  } catch (err) {
    return { ok: false, reason: "error", message: (err as Error).message }
  }
}
