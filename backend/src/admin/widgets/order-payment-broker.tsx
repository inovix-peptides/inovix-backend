import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, AdminOrder } from "@medusajs/types"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Prompt,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

import {
  validateRefundAmount,
  type PaymentEvent,
  type PaymentView,
} from "./order-payment-broker.logic"
import { paymentViewGate } from "./order-fulfillment-checklist.logic"

// Dutch labels + badge colour per payment status.
const STATUS_META: Record<string, { label: string; color: "green" | "orange" | "red" | "grey" }> = {
  captured: { label: "Betaald", color: "green" },
  authorized: { label: "Geautoriseerd", color: "orange" },
  pending: { label: "In afwachting", color: "grey" },
  refunded: { label: "Terugbetaald", color: "grey" },
  canceled: { label: "Geannuleerd", color: "red" },
  cancelled: { label: "Geannuleerd", color: "red" },
  failed: { label: "Mislukt", color: "red" },
}

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, color: "grey" as const }
}

// Dutch labels for the Mollie payment method passed through by the broker.
const METHOD_LABELS: Record<string, string> = {
  ideal: "iDEAL",
  creditcard: "Creditcard",
  bancontact: "Bancontact",
  banktransfer: "Overboeking",
  paypal: "PayPal",
  applepay: "Apple Pay",
  in3: "in3",
  klarna: "Klarna",
}

function methodLabel(method: string | null): string {
  if (!method) return "|"
  return METHOD_LABELS[method] ?? method
}

const EVENT_LABELS: Record<PaymentEvent["type"], string> = {
  created: "Betaling gestart",
  captured: "Betaald",
  refunded: "Terugbetaald",
  canceled: "Geannuleerd",
}

// Refresh cadence for the auto-poll; manual "Vernieuwen" stays available.
const REFRESH_MS = 60_000

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: currency || "EUR",
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

function formatWhen(d: string | null): string {
  if (!d) return "|"
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

const OrderPaymentBrokerWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const orderId = data.id
  const [payment, setPayment] = useState<PaymentView | null>(null)
  const [loading, setLoading] = useState(true)
  // null = no broker payment on this order -> render nothing.
  const [hasBrokerPayment, setHasBrokerPayment] = useState(true)
  const [amount, setAmount] = useState("")
  const [refunding, setRefunding] = useState(false)

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true)
    try {
      const res = await fetch(`/admin/orders/${orderId}/payment`, {
        credentials: "include",
      })
      if (res.status === 404) {
        setHasBrokerPayment(false)
        return
      }
      const json = (await res.json()) as { payment?: PaymentView }
      if (json.payment) {
        setPayment(json.payment)
        setAmount(json.payment.remaining_refundable.toFixed(2))
      }
    } catch {
      // Leave the previous view in place on a transient failure.
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(false), REFRESH_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  async function doRefund() {
    if (!payment) return
    const parsed = Number(amount.replace(",", "."))
    const check = validateRefundAmount(parsed, payment.remaining_refundable)
    if (!check.ok) {
      toast.error("Ongeldig bedrag", { description: check.error })
      return
    }
    setRefunding(true)
    try {
      const res = await fetch(`/admin/orders/${orderId}/payment/refund`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsed }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? `Mislukt (${res.status})`)
      }
      const json = (await res.json()) as { payment?: PaymentView }
      if (json.payment) {
        setPayment(json.payment)
        setAmount(json.payment.remaining_refundable.toFixed(2))
      }
      toast.success(`Terugbetaald: ${money(parsed, payment.currency)}`)
    } catch (e) {
      toast.error("Terugbetaling mislukt", {
        description: e instanceof Error ? e.message : "Onbekende fout",
      })
    } finally {
      setRefunding(false)
    }
  }

  if (!hasBrokerPayment) return null

  if (loading && !payment) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            Betaalgegevens laden...
          </Text>
        </div>
      </Container>
    )
  }

  if (!payment) return null

  const meta = statusMeta(payment.status)
  const canRefund = payment.remaining_refundable > 0
  const gate = paymentViewGate(payment)

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Betaling (Mollie)</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Live status via de betaalprovider, ververst automatisch elke minuut.
            Beheer terugbetalingen hier zonder in te loggen bij Mollie.
          </Text>
        </div>
        <Button
          variant="secondary"
          size="small"
          isLoading={loading}
          onClick={() => void load(false)}
        >
          Vernieuwen
        </Button>
      </div>

      {payment.broker_unavailable && (
        <div className="px-6 py-3">
          <Text size="small" className="text-ui-fg-muted">
            Live status van de provider is nu niet beschikbaar. Onderstaande
            bedragen komen uit Medusa.
          </Text>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-6 py-4">
        <Field label="Status">
          <Badge color={meta.color} size="2xsmall">
            {meta.label}
          </Badge>
        </Field>
        <Field label="Betaalmethode">
          <Text size="small">{methodLabel(payment.method)}</Text>
        </Field>
        <Field label="Bedrag">
          <Text size="small">{money(payment.amount, payment.currency)}</Text>
        </Field>
        <Field label="Betaald op">
          <Text size="small">{formatWhen(payment.captured_at)}</Text>
        </Field>
        <Field label="Ontvangen">
          <Text size="small">{money(payment.captured_total, payment.currency)}</Text>
        </Field>
        <Field label="Terugbetaald">
          <Text size="small">{money(payment.refunded_total, payment.currency)}</Text>
        </Field>
        <Field label="Resterend te storten">
          <Text size="small" weight="plus">
            {money(payment.remaining_refundable, payment.currency)}
          </Text>
        </Field>
        <Field label="Mollie betaal-ID">
          <Text size="small" className="text-ui-fg-subtle font-mono">
            {payment.mollie_payment_id ?? "|"}
          </Text>
        </Field>
        <Field label="Verzendvrijgave">
          {gate.ok ? (
            <Badge color="green" size="2xsmall">
              Vrijgegeven voor verzending
            </Badge>
          ) : (
            <Badge color="red" size="2xsmall">
              Geblokkeerd | {gate.reason}
            </Badge>
          )}
        </Field>
      </div>

      {payment.history.length > 0 && (
        <div className="px-6 py-4">
          <Text size="small" weight="plus" className="mb-2">
            Geschiedenis
          </Text>
          <div className="flex flex-col divide-y">
            {payment.history.map((e, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <Text size="small">
                  {EVENT_LABELS[e.type]}
                  {e.amount != null ? ` | ${money(e.amount, payment.currency)}` : ""}
                  {e.note ? ` | ${e.note}` : ""}
                </Text>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {formatWhen(e.at)}
                </Text>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-6 py-4">
        <Text size="small" weight="plus" className="mb-2">
          Terugbetalen
        </Text>
        {canRefund ? (
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label size="xsmall" className="text-ui-fg-subtle">
                Bedrag ({payment.currency})
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-40"
              />
            </div>
            <Prompt>
              <Prompt.Trigger asChild>
                <Button variant="danger" size="small" disabled={refunding} isLoading={refunding}>
                  Terugbetalen
                </Button>
              </Prompt.Trigger>
              <Prompt.Content>
                <Prompt.Header>
                  <Prompt.Title>Terugbetaling bevestigen</Prompt.Title>
                  <Prompt.Description>
                    Je staat op het punt {money(Number(amount.replace(",", ".")) || 0, payment.currency)}{" "}
                    terug te betalen aan de klant via Mollie. Dit kan niet ongedaan
                    worden gemaakt.
                  </Prompt.Description>
                </Prompt.Header>
                <Prompt.Footer>
                  <Prompt.Cancel>Annuleren</Prompt.Cancel>
                  <Prompt.Action onClick={() => void doRefund()}>
                    Terugbetalen
                  </Prompt.Action>
                </Prompt.Footer>
              </Prompt.Content>
            </Prompt>
          </div>
        ) : (
          <Text size="small" className="text-ui-fg-muted">
            Er is niets meer om terug te betalen.
          </Text>
        )}
      </div>
    </Container>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Text size="xsmall" className="text-ui-fg-subtle">
        {label}
      </Text>
      {children}
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderPaymentBrokerWidget
