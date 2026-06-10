import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import { createDhlParcelShipmentWorkflow } from "../../../../../workflows/create-dhl-parcel-shipment"

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
//     order-dhl-parcel.tsx.
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
  "email",
  "shipping_address.*",
  "items.*",
  "items.variant.*",
  "items.variant.product.*",
  "shipping_methods.id",
  "shipping_methods.data",
  "shipping_methods.shipping_option_id",
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
      input: { order },
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
