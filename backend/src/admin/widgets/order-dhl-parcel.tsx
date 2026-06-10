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
  shipped_at?: string | null
  canceled_at?: string | null
  data?: Record<string, unknown> | null
  labels?: FulfillmentLabel[]
}

// A line item, only the bits we need to verify the product is shippable.
// item.variant.product.weight is the real Medusa v2 product-weight path and is
// loaded by default on the admin order detail (defaultAdminRetrieveOrderFields
// includes *items.variant.product), so requesting it here is safe.
type DhlLineItem = {
  id: string
  title?: string | null
  variant?: {
    product?: { weight?: number | null; title?: string | null } | null
  } | null
}

// The fetched order shape: starts from AdminOrder (which carries .id) and adds
// the extra fields we request via ?fields= on the fetch.
type FetchedOrder = {
  id: string
  shipping_methods?: DhlShippingMethod[]
  fulfillments?: DhlFulfillment[]
  items?: DhlLineItem[]
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
  "fulfillments.shipped_at",
  "fulfillments.canceled_at",
  "fulfillments.data",
  "fulfillments.labels.tracking_number",
  "fulfillments.labels.tracking_url",
  "fulfillments.labels.label_url",
  // Product weight per line item: a DHL label cannot be made without it, so we
  // pre-check here and tell the operator before they hit a failed POST.
  "items.id",
  "items.title",
  "items.variant.product.weight",
  "items.variant.product.title",
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
      // Ignore canceled fulfillments.
      if (f.canceled_at) {
        return false
      }
      // Provider is registered under the COMPOSED id `dhl-parcel_dhl-parcel`.
      if (f.provider_id === "dhl-parcel" || f.provider_id === "dhl-parcel_dhl-parcel") {
        return true
      }
      // Also check data fields written by our provider service.
      if (f.data?.dhl_tracking_number) {
        return true
      }
      // Check labels.
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

// Names of products on the order that have no weight. DHL cannot create a label
// without a product weight, so the label flow fails server-side on these. We
// surface them here (matching validate-order's `weight == null` rule) so the
// operator fixes the product first instead of clicking into a failure.
function productsMissingWeight(order: FetchedOrder): string[] {
  const names = new Set<string>()
  for (const item of order.items ?? []) {
    if (item.variant?.product?.weight == null) {
      names.add(
        item.title || item.variant?.product?.title || "Onbekend product"
      )
    }
  }
  return [...names]
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
            Hiermee maak je het DHL-verzendlabel aan voor deze bestelling. De
            verzendkosten worden op je DHL-account in rekening gebracht.
            Controleer eerst het bezorgadres en de bezorgwijze. Doorgaan?
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
  isShipped?: boolean
}

function SendEmailPrompt({
  open,
  onOpenChange,
  orderId,
  isShipped,
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
      toast.success(
        isShipped
          ? "Verzendmail opnieuw verstuurd naar klant"
          : "Gemarkeerd als verzonden | klant gemaild"
      )
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
          <Prompt.Title>
            {isShipped ? "Verzendmail opnieuw sturen" : "Markeer als verzonden"}
          </Prompt.Title>
          <Prompt.Description>
            {isShipped
              ? "Deze bestelling is al gemarkeerd als verzonden. Dit stuurt de klant nogmaals dezelfde verzendmail met de track-and-trace link. Doe dit alleen als de klant de mail niet ontvangen heeft. Doorgaan?"
              : "Hiermee wordt de bestelling gemarkeerd als verzonden en ontvangt de klant eenmalig de verzendmail met de track-and-trace link. Doorgaan?"}
          </Prompt.Description>
        </Prompt.Header>
        <Prompt.Footer>
          <Prompt.Cancel disabled={busy}>Annuleren</Prompt.Cancel>
          <Prompt.Action onClick={handleConfirm}>
            {busy
              ? "Bezig..."
              : isShipped
                ? "Opnieuw sturen"
                : "Markeer als verzonden"}
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
    const isShipped = Boolean(dhlFulfillment.shipped_at)
    return (
      <>
        <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex flex-col gap-1">
              <Heading level="h2">DHL Parcel NL</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {isShipped
                  ? "Verzonden | de klant heeft de track-and-trace mail ontvangen."
                  : "Het label is aangemaakt. Markeer als verzonden zodra je het pakket afgeeft; de klant krijgt dan de verzendmail."}
              </Text>
            </div>
            <span
              className={
                isShipped
                  ? "border border-ui-tag-green-border bg-ui-tag-green-bg px-2 py-0.5 text-[10px] uppercase tracking-wider text-ui-tag-green-text"
                  : "border border-ui-border-base bg-ui-bg-subtle px-2 py-0.5 text-[10px] uppercase tracking-wider text-ui-fg-subtle"
              }
            >
              {isShipped ? "Verzonden" : "Label klaar"}
            </span>
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
              {isShipped ? "Verzendmail opnieuw sturen" : "Markeer als verzonden & mail klant"}
            </Button>
          </div>
        </Container>

        <SendEmailPrompt
          open={emailOpen}
          onOpenChange={setEmailOpen}
          orderId={orderId}
          isShipped={isShipped}
        />
      </>
    )
  }

  // ── State 2: DHL method present but NO label yet ──────────────────────────

  // Pre-flight: a label cannot be created while any product lacks a weight.
  // Block the button and explain, instead of letting the operator click into a
  // server-side failure.
  const missingWeight = productsMissingWeight(order)
  const blocked = missingWeight.length > 0

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

          {blocked ? (
            <div
              style={{
                border: "1px solid #fcd34d",
                background: "#fffbeb",
                padding: "12px 14px",
              }}
            >
              <Text size="small" weight="plus" style={{ color: "#92400e" }}>
                {missingWeight.length === 1
                  ? "Dit product heeft nog geen gewicht"
                  : "Deze producten hebben nog geen gewicht"}
              </Text>
              <Text size="small" style={{ color: "#78350f", marginTop: "4px" }}>
                Zonder gewicht kan DHL geen label aanmaken. Stel eerst het
                gewicht (in gram) in op{" "}
                {missingWeight.map((n) => `"${n}"`).join(", ")} en kom dan hier
                terug om het label aan te maken.
              </Text>
            </div>
          ) : (
            <Text size="small" className="text-ui-fg-muted">
              Nog geen DHL-label aangemaakt voor deze bestelling.
            </Text>
          )}
        </div>
        <div className="flex items-center justify-end px-6 py-4">
          <Button
            variant="primary"
            size="small"
            disabled={blocked}
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
