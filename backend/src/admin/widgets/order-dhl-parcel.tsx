import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, AdminOrder } from "@medusajs/types"
import {
  Button,
  Container,
  Heading,
  Prompt,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

// ─── Types for the extra fields we fetch beyond the shallow AdminOrder ────────

type DhlShippingOption = {
  provider_id: string
  data?: Record<string, unknown> | null
}

type DhlShippingMethod = {
  id: string
  data?: Record<string, unknown> | null
  shipping_option?: DhlShippingOption | null
}

type FulfillmentLabel = {
  tracking_number?: string | null
  tracking_url?: string | null
  label_url?: string | null
}

type DhlFulfillment = {
  id: string
  provider_id: string
  data?: Record<string, unknown> | null
  labels?: FulfillmentLabel[]
}

// The fetched order shape: starts from AdminOrder (which carries .id) and adds
// the extra fields we request via ?fields= on the fetch.
type FetchedOrder = {
  id: string
  shipping_methods?: DhlShippingMethod[]
  fulfillments?: DhlFulfillment[]
}

// ─── Field selection for the widget's own order fetch ────────────────────────

// NOTE: do NOT request `shipping_methods.shipping_option.*` here. That
// cross-module expansion (order_shipping_method -> fulfillment shipping_option)
// is not resolvable on the admin order GET and makes it 500 ("Cannot read
// properties of undefined (reading 'strategy')"), which surfaced as the widget
// failing to load. The DHL method is identified from shipping_methods.data
// (dhl_option) instead, which is all the widget needs.
const ORDER_FIELDS = [
  "id",
  "shipping_methods.id",
  "shipping_methods.data",
  "shipping_methods.shipping_option_id",
  "fulfillments.id",
  "fulfillments.provider_id",
  "fulfillments.data",
  "fulfillments.labels.tracking_number",
  "fulfillments.labels.tracking_url",
  "fulfillments.labels.label_url",
].join(",")

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findDhlMethod(order: FetchedOrder): DhlShippingMethod | null {
  const methods = order.shipping_methods ?? []
  return (
    methods.find((m) => {
      const providerId = m.shipping_option?.provider_id
      const hasOption = providerId === "dhl-parcel"
      const hasDhlData = m.data && typeof m.data.dhl_option === "string"
      return hasOption || hasDhlData
    }) ?? null
  )
}

function findDhlFulfillment(order: FetchedOrder): DhlFulfillment | null {
  const fulfillments = order.fulfillments ?? []
  return (
    fulfillments.find((f) => {
      // Check provider_id first
      if (f.provider_id === "dhl-parcel") {
        return true
      }
      // Also check data fields written by our provider service
      if (f.data?.dhl_tracking_number) {
        return true
      }
      // Check labels
      return (f.labels ?? []).some(
        (l) => l.tracking_number != null && l.tracking_number !== ""
      )
    }) ?? null
  )
}

function getTrackingNumber(fulfillment: DhlFulfillment): string | null {
  // Prefer data.dhl_tracking_number (written by our provider service)
  if (typeof fulfillment.data?.dhl_tracking_number === "string") {
    return fulfillment.data.dhl_tracking_number as string
  }
  // Fall back to labels[0].tracking_number
  return fulfillment.labels?.[0]?.tracking_number ?? null
}

function getLabelPdfUrl(fulfillment: DhlFulfillment): string | null {
  // Prefer data.dhl_label_pdf_url (written by our provider service)
  if (typeof fulfillment.data?.dhl_label_pdf_url === "string") {
    return fulfillment.data.dhl_label_pdf_url as string
  }
  // Fall back to labels[0].label_url
  return fulfillment.labels?.[0]?.label_url ?? null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type CreateLabelPromptProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  onSuccess: () => void
}

function CreateLabelPrompt({
  open,
  onOpenChange,
  orderId,
  onSuccess,
}: CreateLabelPromptProps) {
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    try {
      const res = await fetch(`/admin/orders/${orderId}/dhl-label`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      })
      const body = await res.json().catch(() => ({})) as {
        message?: string
        tracking_number?: string
      }
      if (!res.ok) {
        throw new Error(body.message ?? `Aanmaken mislukt (${res.status})`)
      }
      toast.success(
        `DHL-label aangemaakt${body.tracking_number ? ` | ${body.tracking_number}` : ""}`
      )
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      toast.error("Label aanmaken mislukt", {
        description:
          err instanceof Error ? err.message : "Onbekende fout",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Prompt open={open} onOpenChange={onOpenChange}>
      <Prompt.Content>
        <Prompt.Header>
          <Prompt.Title>DHL-label aanmaken</Prompt.Title>
          <Prompt.Description>
            Hiermee maak je een echt DHL-label aan. In LIVE-modus belast DHL je
            account voor de verzendkosten; in testmodus is het label gratis en
            wordt het niet daadwerkelijk verzonden. Doorgaan?
          </Prompt.Description>
        </Prompt.Header>
        <Prompt.Footer>
          <Prompt.Cancel disabled={busy}>Annuleren</Prompt.Cancel>
          <Prompt.Action onClick={handleConfirm}>
            {busy ? "Aanmaken..." : "Doorgaan"}
          </Prompt.Action>
        </Prompt.Footer>
      </Prompt.Content>
    </Prompt>
  )
}

type SendEmailPromptProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
}

function SendEmailPrompt({
  open,
  onOpenChange,
  orderId,
}: SendEmailPromptProps) {
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    try {
      const res = await fetch(
        `/admin/orders/${orderId}/dhl-label/send-email`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        }
      )
      const body = await res.json().catch(() => ({})) as {
        sent?: boolean
        message?: string
      }
      if (!res.ok) {
        throw new Error(body.message ?? `Verzenden mislukt (${res.status})`)
      }
      toast.success("Verzendmail verstuurd naar klant")
      onOpenChange(false)
    } catch (err) {
      toast.error("Verzendmail verzenden mislukt", {
        description:
          err instanceof Error ? err.message : "Onbekende fout",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Prompt open={open} onOpenChange={onOpenChange}>
      <Prompt.Content>
        <Prompt.Header>
          <Prompt.Title>Verzendmail sturen</Prompt.Title>
          <Prompt.Description>
            Dit stuurt de klant eenmalig de verzendmail met de track-and-trace
            link. De klant ontvangt deze mail slechts eenmaal; stuur hem niet
            opnieuw tenzij de klant aangeeft hem niet ontvangen te hebben.
            Doorgaan?
          </Prompt.Description>
        </Prompt.Header>
        <Prompt.Footer>
          <Prompt.Cancel disabled={busy}>Annuleren</Prompt.Cancel>
          <Prompt.Action onClick={handleConfirm}>
            {busy ? "Sturen..." : "Sturen"}
          </Prompt.Action>
        </Prompt.Footer>
      </Prompt.Content>
    </Prompt>
  )
}

// ─── Widget ───────────────────────────────────────────────────────────────────

const OrderDhlParcelWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const orderId = data.id

  const [order, setOrder] = useState<FetchedOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)

  async function loadOrder() {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(
        `/admin/orders/${orderId}?fields=${ORDER_FIELDS}`,
        { credentials: "include" }
      )
      if (!res.ok) {
        throw new Error(`Laden mislukt (${res.status})`)
      }
      const json = (await res.json()) as { order?: FetchedOrder }
      setOrder(json.order ?? null)
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Onbekende fout"
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOrder()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            DHL-bezorggegevens laden...
          </Text>
        </div>
      </Container>
    )
  }

  if (fetchError) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-error">
            Fout bij laden: {fetchError}
          </Text>
        </div>
      </Container>
    )
  }

  // ── State 1: no DHL Parcel shipping method — render nothing ───────────────

  if (!order) {
    return null
  }

  const dhlMethod = findDhlMethod(order)

  if (!dhlMethod) {
    return null
  }

  // ── Derive option type + service point details ────────────────────────────

  const methodData = dhlMethod.data ?? {}
  const dhlOption =
    typeof methodData.dhl_option === "string" ? methodData.dhl_option : null

  const isDoor = dhlOption === "DOOR" || dhlOption == null
  const isPs = dhlOption === "PS"

  const servicePointName =
    typeof methodData.service_point_name === "string"
      ? methodData.service_point_name
      : null
  const servicePointAddress =
    typeof methodData.service_point_address === "string"
      ? methodData.service_point_address
      : null

  // ── State 3: label already exists ────────────────────────────────────────

  const dhlFulfillment = findDhlFulfillment(order)
  const trackingNumber = dhlFulfillment
    ? getTrackingNumber(dhlFulfillment)
    : null
  const labelPdfUrl = dhlFulfillment ? getLabelPdfUrl(dhlFulfillment) : null
  const hasLabel = Boolean(trackingNumber)

  if (hasLabel && dhlFulfillment) {
    return (
      <>
        <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex flex-col gap-1">
              <Heading level="h2">DHL Parcel NL</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                Het label is aangemaakt. Download het of stuur de klant de
                verzendmail.
              </Text>
            </div>
          </div>
          <div className="flex flex-col gap-3 px-6 py-4">
            {/* Option badge */}
            <div className="flex items-center gap-2">
              <Text size="small" className="text-ui-fg-subtle">
                Bezorgwijze:
              </Text>
              <span className="border border-ui-border-base bg-ui-bg-subtle px-2 py-0.5 text-[10px] uppercase tracking-wider text-ui-fg-subtle">
                {isPs ? "DHL Servicepunt" : "DHL Thuisbezorgd"}
              </span>
            </div>

            {/* Service point details if PS */}
            {isPs && (servicePointName || servicePointAddress) && (
              <div className="flex flex-col gap-0.5">
                {servicePointName && (
                  <Text size="small" weight="plus">
                    {servicePointName}
                  </Text>
                )}
                {servicePointAddress && (
                  <Text size="small" className="text-ui-fg-subtle">
                    {servicePointAddress}
                  </Text>
                )}
              </div>
            )}

            {/* Tracking number */}
            <div className="flex items-center gap-2">
              <Text size="small" className="text-ui-fg-subtle">
                Tracking:
              </Text>
              <Text size="small" weight="plus" className="font-mono">
                {trackingNumber}
              </Text>
            </div>

            {/* Download PDF */}
            {labelPdfUrl && (
              <a
                href={labelPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="txt-small text-ui-fg-interactive hover:underline"
              >
                Download label-PDF
              </a>
            )}
          </div>
          <div className="flex items-center justify-end px-6 py-4">
            <Button
              variant="secondary"
              size="small"
              onClick={() => setEmailOpen(true)}
            >
              Verzendmail sturen
            </Button>
          </div>
        </Container>

        <SendEmailPrompt
          open={emailOpen}
          onOpenChange={setEmailOpen}
          orderId={orderId}
        />
      </>
    )
  }

  // ── State 2: DHL method present but NO label yet ──────────────────────────

  return (
    <>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex flex-col gap-1">
            <Heading level="h2">DHL Parcel NL</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Maak hier het DHL-verzendlabel voor deze bestelling.
            </Text>
          </div>
        </div>
        <div className="flex flex-col gap-3 px-6 py-4">
          {/* Option badge */}
          <div className="flex items-center gap-2">
            <Text size="small" className="text-ui-fg-subtle">
              Bezorgwijze:
            </Text>
            <span className="border border-ui-border-base bg-ui-bg-subtle px-2 py-0.5 text-[10px] uppercase tracking-wider text-ui-fg-subtle">
              {isPs ? "DHL Servicepunt" : "DHL Thuisbezorgd"}
            </span>
          </div>

          {/* Service point details if PS */}
          {isPs && (servicePointName || servicePointAddress) && (
            <div className="flex flex-col gap-0.5">
              {servicePointName && (
                <Text size="small" weight="plus">
                  {servicePointName}
                </Text>
              )}
              {servicePointAddress && (
                <Text size="small" className="text-ui-fg-subtle">
                  {servicePointAddress}
                </Text>
              )}
            </div>
          )}

          <Text size="small" className="text-ui-fg-muted">
            Nog geen DHL-label aangemaakt voor deze bestelling.
          </Text>
        </div>
        <div className="flex items-center justify-end px-6 py-4">
          <Button
            variant="primary"
            size="small"
            onClick={() => setCreateOpen(true)}
          >
            Maak DHL-label
          </Button>
        </div>
      </Container>

      <CreateLabelPrompt
        open={createOpen}
        onOpenChange={setCreateOpen}
        orderId={orderId}
        onSuccess={loadOrder}
      />
    </>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderDhlParcelWidget
