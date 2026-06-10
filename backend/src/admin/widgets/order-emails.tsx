import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, AdminOrder } from "@medusajs/types"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

type OrderNotification = {
  id: string
  template: string
  to: string
  status: string | null
  created_at: string
  idempotency_key: string | null
}

// Friendly Dutch labels for the template ids.
const TEMPLATE_LABELS: Record<string, string> = {
  "order-placed": "Bestelbevestiging",
  "order-shipped": "Verzonden (track & trace)",
  "order-cancelled": "Annulering",
  "order-refunded": "Terugbetaling",
  "payment-failed": "Betaling mislukt",
  "customer-welcome": "Welkom",
  "password-reset": "Wachtwoord herstellen",
  "password-changed": "Wachtwoord gewijzigd",
  "invite-user": "Uitnodiging",
  "abandoned-cart-paid": "Herinnering winkelwagen",
}

function formatWhen(d: string): string {
  try {
    return new Date(d).toLocaleString("nl-NL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return d
  }
}

const OrderEmailsWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const orderId = data.id
  const [notifications, setNotifications] = useState<OrderNotification[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [resendingId, setResendingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/admin/orders/${orderId}/notifications`, {
        credentials: "include",
      })
      const json = (await res.json()) as { notifications?: OrderNotification[] }
      setNotifications(json.notifications ?? [])
    } catch {
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  async function resend(n: OrderNotification) {
    setResendingId(n.id)
    try {
      const res = await fetch(`/admin/orders/${orderId}/notifications`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_id: n.id }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(b.message ?? `Mislukt (${res.status})`)
      }
      toast.success(
        `E-mail opnieuw verstuurd: ${TEMPLATE_LABELS[n.template] ?? n.template}`
      )
      void load()
    } catch (e) {
      toast.error("Opnieuw versturen mislukt", {
        description: e instanceof Error ? e.message : "Onbekende fout",
      })
    } finally {
      setResendingId(null)
    }
  }

  if (loading) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            Verzonden e-mails laden...
          </Text>
        </div>
      </Container>
    )
  }

  if (!notifications) {
    return null
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Verzonden e-mails</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Alle e-mails die naar deze klant zijn verstuurd. Klik &quot;Opnieuw
          sturen&quot; als de klant er een niet ontvangen heeft.
        </Text>
      </div>

      {notifications.length === 0 ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-muted">
            Nog geen e-mails verstuurd voor deze bestelling.
          </Text>
        </div>
      ) : (
        <div className="flex flex-col divide-y">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-center justify-between gap-4 px-6 py-3"
            >
              <div className="flex flex-col gap-0.5">
                <Text size="small" weight="plus">
                  {TEMPLATE_LABELS[n.template] ?? n.template}
                </Text>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {formatWhen(n.created_at)} | {n.to}
                  {n.status ? ` | ${n.status}` : ""}
                </Text>
              </div>
              <Button
                variant="secondary"
                size="small"
                isLoading={resendingId === n.id}
                onClick={() => resend(n)}
              >
                Opnieuw sturen
              </Button>
            </div>
          ))}
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderEmailsWidget
