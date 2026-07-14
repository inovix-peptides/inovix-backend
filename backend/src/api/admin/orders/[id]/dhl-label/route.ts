import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import { createDhlParcelShipmentWorkflow } from "../../../../../workflows/create-dhl-parcel-shipment"
import { resolveBrokerPayment } from "../payment/resolve"
import {
  allItemsTicked,
  hasOverride,
  parseChecklist,
} from "../../../../../admin/widgets/order-fulfillment-checklist.logic"

// Fields loaded via query.graph to give the workflow everything it reads.
//
// query.graph SYNTAX (both verified against prod order #13 on 2026-06-10):
//  1. Use TRAILING-star nested paths ("items.variant.product.*"), NOT the
//     leading-star dotted form ("*items.variant.product"). The leading-star
//     form is what the admin HTTP ?fields= parser / query-config defaults
//     accept, but a direct query.graph call rejects a leading star on a dotted
//     path with "Entity 'Order' does not have property '*items'".
//  2. Do NOT request shipping_methods.shipping_option(.*): that
//     order_shipping_method -> fulfillment shipping_option cross-module
//     expansion is unresolvable here and throws "Cannot read properties of
//     undefined (reading 'strategy')". Both errors 500 the label request BEFORE
//     the try/catch below; (2) was the original order #13 failure and (1) was
//     hiding behind it. The order widget hit the same walls, see
//     order-fulfillment-checklist.tsx.
//
// - items.variant.product.*: the product-weight path. After loading, each item
//   is reshaped so item.product = item.variant?.product, matching the shape the
//   workflow's validate-order / build-payload / service steps expect at
//   item.product.weight.
// - shipping_methods.data: carries the DHL DOOR/PS selection (dhl_option) and,
//   for Servicepunt, the service_point_id. findDhlParcelMethod detects the DHL
//   method from this (provider_id is not needed).
const ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "metadata",
  "email",
  "shipping_address.*",
  "items.*",
  "items.variant.*",
  "items.variant.product.*",
  "shipping_methods.id",
  "shipping_methods.data",
  "shipping_methods.shipping_option_id",
  // Existing fulfillments: used to refuse buying a second label for an order
  // that already has one (idempotency guard below).
  "fulfillments.id",
  "fulfillments.provider_id",
  "fulfillments.canceled_at",
  "fulfillments.data",
  "fulfillments.labels.tracking_number",
  "fulfillments.labels.tracking_url",
  "fulfillments.labels.label_url",
]

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const orderId = req.params.id
  const logger = req.scope.resolve("logger") as Logger
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // 1. Load the order fully.
  const { data: orders } = await query.graph({
    entity: "order",
    filters: { id: orderId },
    fields: ORDER_FIELDS,
  })

  const raw = orders?.[0]
  if (!raw) {
    res.status(404).json({ message: `Order ${orderId} not found` })
    return
  }

  // 1b. Idempotency guard: if this order already has a (non-canceled) DHL
  //     fulfillment with a tracking number, return it instead of buying a
  //     second label. The widget hides the create button once a label exists,
  //     but this is the server-side backstop against a double POST.
  const existing = ((raw.fulfillments ?? []) as any[]).find((f) => {
    if (f.canceled_at) return false
    const trackingFromLabel = (f.labels ?? []).some(
      (l: any) => l.tracking_number != null && l.tracking_number !== ""
    )
    const trackingFromData = typeof f.data?.dhl_tracking_number === "string"
    const isDhl = f.provider_id === "dhl-parcel_dhl-parcel" || trackingFromData
    return isDhl && (trackingFromData || trackingFromLabel)
  })
  if (existing) {
    const d: any = existing.data ?? {}
    const l: any = existing.labels?.[0] ?? {}
    logger.info(
      `admin.dhl-label: order ${orderId} already has fulfillment ${existing.id}; returning existing label (no second label bought)`
    )
    res.status(200).json({
      fulfillment_id: existing.id,
      tracking_number: d.dhl_tracking_number ?? l.tracking_number ?? null,
      label_pdf_url: d.dhl_label_pdf_url ?? l.label_url ?? null,
      shipment_tracking_url: d.dhl_shipment_tracking_url ?? l.tracking_url ?? null,
      already_existed: true,
    })
    return
  }

  // 1c. Label attempt number = how many DHL fulfillments this order already had
  //     (including canceled ones) + 1. The provider seeds the DHL labelId from
  //     order.id + this number, so canceling a wrong label and creating a new
  //     one yields a FRESH DHL label instead of colliding with the old one (DHL
  //     permanently reserves a used label id, so without this the recovery would
  //     just hand back the old, wrong label).
  const priorDhlFulfillments = ((raw.fulfillments ?? []) as any[]).filter(
    (f: any) =>
      f.provider_id === "dhl-parcel_dhl-parcel" ||
      typeof f.data?.dhl_tracking_number === "string"
  ).length
  const labelAttempt = priorDhlFulfillments + 1

  // 1d. Fulfillment-checklist gates. The checklist widget disables the button
  //     client-side; this is the server-side backstop so the flow stays
  //     foolproof even via direct API calls. An explicit, reasoned override
  //     recorded in the checklist (metadata) unlocks each gate separately.
  const checklist = parseChecklist((raw as any).metadata)
  const itemIds = ((raw.items ?? []) as any[]).map((i: any) => String(i.id))
  if (!allItemsTicked(itemIds, checklist) && !hasOverride(checklist, "items")) {
    res.status(400).json({
      message:
        "Nog niet alle items zijn afgevinkt op de picklijst. Vink eerst elk item af in de verzendchecklist, of gebruik de override met reden.",
    })
    return
  }

  // The broker payment feeds the payment gate inside the workflow's
  // validate-order step (fully captured, no refunds, not canceled).
  const payment = await resolveBrokerPayment(query, orderId)

  // 2. Reshape items: expose item.product = item.variant?.product so the
  //    workflow (validate-order / build-payload / service) reads
  //    item.product.weight as expected. The natural Medusa v2 graph path is
  //    items[i].variant.product but the workflow contract is items[i].product.
  const reshapedItems = ((raw.items ?? []) as any[]).map((item: any) => ({
    ...item,
    product: item.variant?.product ?? item.product ?? null,
  }))

  const order = {
    ...raw,
    items: reshapedItems,
  }

  // 3. Run the workflow.
  try {
    const { result } = await createDhlParcelShipmentWorkflow(req.scope).run({
      input: {
        order,
        labelAttempt,
        payment,
        paymentOverridden: hasOverride(checklist, "payment"),
      },
    })

    // 4. Map the response. Prefer fulfillment.data.* fields (written by
    //    DhlParcelFulfillmentProviderService.createFulfillment). Fall back to
    //    fulfillment.labels[0] in case data is not fully populated on the
    //    returned object (flagged for Task 22 live verification).
    const fulfillment: any = result.fulfillment
    const data: any = fulfillment?.data ?? {}
    const label0: any = fulfillment?.labels?.[0] ?? {}

    const tracking_number: string | null =
      data.dhl_tracking_number ?? label0.tracking_number ?? null
    const label_pdf_url: string | null =
      data.dhl_label_pdf_url ?? label0.label_url ?? null
    const shipment_tracking_url: string | null =
      data.dhl_shipment_tracking_url ?? label0.tracking_url ?? null

    logger.info(
      `admin.dhl-label: created fulfillment ${result.fulfillment_id} for order ${orderId} | tracking=${tracking_number}`
    )

    res.status(201).json({
      fulfillment_id: result.fulfillment_id,
      tracking_number,
      label_pdf_url,
      shipment_tracking_url,
    })
  } catch (err: any) {
    // Distinguish workflow validation failures (MedusaError) from unexpected errors.
    // NOTE: use isMedusaError (not instanceof): the workflow engine serializes step
    // errors to plain objects before re-throwing, so instanceof fails but the
    // __isMedusaError marker (checked by isMedusaError) survives.
    if (MedusaError.isMedusaError(err)) {
      const status =
        err.type === MedusaError.Types.NOT_FOUND ? 404
        : err.type === MedusaError.Types.NOT_ALLOWED ? 400
        : err.type === MedusaError.Types.INVALID_DATA ? 400
        : 500

      logger.warn(
        `admin.dhl-label: workflow validation failed for order ${orderId}: [${err.type}] ${err.message}`
      )
      res.status(status).json({ message: err.message, details: err.type })
      return
    }

    logger.error(
      `admin.dhl-label: unexpected error for order ${orderId}: ${(err as Error).message}`
    )
    res.status(500).json({
      message: "DHL label creation failed",
      details: (err as Error).message,
    })
  }
}
