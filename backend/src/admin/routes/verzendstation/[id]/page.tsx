import { Button, Container, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"

import OrderFulfillmentChecklistWidget from "../../../widgets/order-fulfillment-checklist"
import { paymentViewGate } from "../../../widgets/order-fulfillment-checklist.logic"
import type { PaymentView } from "../../../widgets/order-payment-broker.logic"

// The warehouse cockpit for ONE order: only what a fulfiller needs | the
// checklist (with live DHL status), the delivery context, and a paid
// verdict. No native Medusa order page, so nothing confusing to click.
// Reached from the Verzendstation queue; the full order page stays one
// click away for the operator.

type FetchedOrder = {
  id: string
  display_id?: number | null
  email?: string | null
  created_at?: string | null
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    company?: string | null
    address_1?: string | null
    address_2?: string | null
    postal_code?: string | null
    city?: string | null
    country_code?: string | null
  } | null
  shipping_methods?: Array<{ id: string; data?: Record<string, unknown> | null }>
}

const ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "created_at",
  "shipping_address.*",
  "shipping_methods.id",
  "shipping_methods.data",
].join(",")

function MetaCard({
  title,
  right,
  children,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Container className="p-0">
      <div className="flex items-center gap-2 border-b border-ui-border-base px-4 py-3">
        <Text size="small" weight="plus">
          {title}
        </Text>
        <div style={{ marginLeft: "auto" }}>{right}</div>
      </div>
      <div className="px-4 py-3">{children}</div>
    </Container>
  )
}

const VerzendstationOrderPage = () => {
  const params = useParams()
  const orderId = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [order, setOrder] = useState<FetchedOrder | null>(null)
  const [payment, setPayment] = useState<PaymentView | null>(null)
  const [paymentLoaded, setPaymentLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    async function load() {
      try {
        const [orderRes, paymentRes] = await Promise.all([
          fetch(`/admin/orders/${orderId}?fields=${ORDER_FIELDS}`, {
            credentials: "include",
          }),
          fetch(`/admin/orders/${orderId}/payment`, { credentials: "include" }),
        ])
        if (cancelled) return
        if (!orderRes.ok) throw new Error(`Laden mislukt (${orderRes.status})`)
        const json = (await orderRes.json()) as { order?: FetchedOrder }
        setOrder(json.order ?? null)
        if (paymentRes.ok) {
          const p = (await paymentRes.json()) as { payment?: PaymentView }
          setPayment(p.payment ?? null)
        }
        setPaymentLoaded(true)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Onbekende fout")
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [orderId])

  if (error) {
    return (
      <Container className="p-6">
        <Text size="small" className="text-ui-fg-error">
          Fout bij laden: {error}
        </Text>
      </Container>
    )
  }

  const a = order?.shipping_address ?? {}
  const customerName =
    `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || (order?.email ?? "")
  const methodData =
    (order?.shipping_methods ?? [])
      .map((m) => m.data ?? {})
      .find((d) => typeof d.dhl_option === "string") ?? {}
  const isPs = methodData.dhl_option === "PS"
  const servicePointName =
    typeof methodData.service_point_name === "string"
      ? methodData.service_point_name
      : null
  const servicePointAddress =
    typeof methodData.service_point_address === "string"
      ? methodData.service_point_address
      : null
  const gate = paymentViewGate(payment)
  const orderedAt = order?.created_at
    ? new Date(order.created_at).toLocaleString("nl-NL", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar */}
      <Container className="p-0">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <Link
            to="/verzendstation"
            className="border border-ui-border-base bg-ui-bg-subtle px-3 py-2 text-sm font-medium text-ui-fg-interactive"
            style={{ textDecoration: "none", whiteSpace: "nowrap" }}
          >
            &#8592; Verzendstation
          </Link>
          <div className="min-w-0">
            <Heading level="h1">
              Bestelling {order?.display_id ? `#${order.display_id}` : "..."}
            </Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {customerName}
              {orderedAt ? ` | besteld ${orderedAt}` : ""}
            </Text>
          </div>
          {paymentLoaded ? (
            <span
              className="px-2 py-0.5 text-[10px] uppercase tracking-wider"
              style={
                gate.ok
                  ? { border: "1px solid #86efac", background: "#f0fdf4", color: "#166534" }
                  : { border: "1px solid #fca5a5", background: "#fef2f2", color: "#991b1b" }
              }
            >
              {gate.ok ? "Betaald" : "Niet betaald"}
            </span>
          ) : null}
          <div style={{ marginLeft: "auto" }} className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="small"
              onClick={() =>
                window.open(`/admin/orders/${orderId}/picklist`, "_blank", "noopener")
              }
            >
              Print picklijst
            </Button>
            <Link
              to={`/orders/${orderId}`}
              className="text-xs text-ui-fg-subtle"
              style={{ whiteSpace: "nowrap" }}
            >
              Volledige bestelpagina
            </Link>
          </div>
        </div>
      </Container>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
        {/* The checklist (self-contained: pick list, gates, DHL label, live
            Zending status, ship button) */}
        <div className="lg:col-span-3">
          <OrderFulfillmentChecklistWidget
            data={{ id: orderId } as never}
          />
        </div>

        {/* Fulfiller context */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <MetaCard
            title="Bezorgen aan"
            right={
              <span className="border border-ui-border-base bg-ui-bg-subtle px-2 py-0.5 text-[10px] uppercase tracking-wider text-ui-fg-subtle">
                {isPs ? "DHL Servicepunt" : "DHL Thuisbezorgd"}
              </span>
            }
          >
            <div className="flex flex-col gap-0.5">
              <Text size="small" weight="plus">
                {customerName}
              </Text>
              {isPs && servicePointName ? (
                <>
                  <Text size="small">{servicePointName}</Text>
                  {servicePointAddress ? (
                    <Text size="small" className="text-ui-fg-subtle">
                      {servicePointAddress}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text size="small">
                    {a.address_1}
                    {a.address_2 ? `, ${a.address_2}` : ""}
                  </Text>
                  <Text size="small">
                    {`${a.postal_code ?? ""} ${a.city ?? ""}`.trim()}
                  </Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    {(a.country_code ?? "").toUpperCase()}
                  </Text>
                </>
              )}
              {order?.email ? (
                <Text size="small" className="text-ui-fg-subtle">
                  {order.email}
                </Text>
              ) : null}
            </div>
          </MetaCard>

          <MetaCard
            title="Betaling"
            right={
              paymentLoaded ? (
                <span
                  className="px-2 py-0.5 text-[10px] uppercase tracking-wider"
                  style={
                    gate.ok
                      ? { border: "1px solid #86efac", background: "#f0fdf4", color: "#166534" }
                      : { border: "1px solid #fca5a5", background: "#fef2f2", color: "#991b1b" }
                  }
                >
                  {gate.ok ? "Vrijgegeven voor verzending" : `Geblokkeerd | ${gate.reason}`}
                </span>
              ) : null
            }
          >
            {payment ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Bedrag
                  </Text>
                  <Text size="small" weight="plus">
                    {new Intl.NumberFormat("nl-NL", {
                      style: "currency",
                      currency: payment.currency || "EUR",
                    }).format(payment.amount)}
                  </Text>
                </div>
                <div>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Methode
                  </Text>
                  <Text size="small" weight="plus">
                    {payment.method === "ideal" ? "iDEAL" : (payment.method ?? "|")}
                  </Text>
                </div>
              </div>
            ) : (
              <Text size="small" className="text-ui-fg-muted">
                {paymentLoaded ? "Geen broker-betaling op deze bestelling." : "Laden..."}
              </Text>
            )}
          </MetaCard>
        </div>
      </div>
    </div>
  )
}

export default VerzendstationOrderPage
