import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules, MedusaError } from "@medusajs/framework/utils"

export type CallDhlInput = {
  order_id: string
  // display_id + email are forwarded into the `order` object below so the
  // dhl-parcel provider can build the DHL receiver, the deterministic labelId
  // and the REFERENCE option. Without them the provider gets `undefined` and
  // DHL rejects the label with 400.
  order_display_id?: number
  order_email?: string | null
  // 1-based attempt number; seeds a fresh labelId on a redo after cancel.
  order_label_attempt?: number
  // The full output of the build-payload step: the dhl_* data fields plus the
  // enriched `items`. This step separates `items` (passed to the fulfillment
  // module) from the rest (persisted on the fulfillment as `data`).
  payload: { items: Array<Record<string, any>> } & Record<string, any>
  delivery_address?: Record<string, any>
}

const callDhl = createStep(
  "call-dhl-parcel-create-shipment",
  async (input: CallDhlInput, { container }: any) => {
    const { items, ...data } = input.payload

    // listStockLocations lives on the Stock Location module, NOT the Fulfillment
    // module. Resolving it separately avoids the silent undefined that the old
    // optional-chain mask (fulfillmentService.listStockLocations?.) would
    // produce in production (the Fulfillment module has no such method).
    // Multi-location selection is a future concern; v1 always uses the first.
    const stockLocationService = container.resolve(Modules.STOCK_LOCATION)
    const stockLocations = await stockLocationService.listStockLocations({})
    if (!stockLocations || stockLocations.length === 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No stock location configured; cannot create DHL Parcel fulfillment",
      )
    }

    // The order's stock reservations (created at checkout for managed variants).
    // We stamp inventory_item_id onto each fulfillment item from these so that
    // Medusa's native CANCEL flow can restore stock later (it only restores for
    // fulfillment items that carry inventory_item_id). Unmanaged variants have no
    // reservation, so those items keep inventory_item_id undefined.
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const lineItemIds = (items as Array<Record<string, any>>)
      .map((i) => i.id)
      .filter(Boolean)
    const invItemByLineItem = new Map<string, string>()
    if (lineItemIds.length > 0) {
      const { data: reservations } = await query.graph({
        entity: "reservation",
        fields: ["line_item_id", "inventory_item_id"],
        filters: { line_item_id: lineItemIds },
      })
      for (const r of reservations as Array<Record<string, any>>) {
        if (r.line_item_id && r.inventory_item_id) {
          invItemByLineItem.set(r.line_item_id, r.inventory_item_id)
        }
      }
    }

    // Map order line items to the shape Medusa's fulfillment module requires for
    // FulfillmentItem rows. Order line items snapshot the sku/barcode under
    // variant_sku / variant_barcode (NOT sku / barcode), so passing them straight
    // through makes the module throw "Value for FulfillmentItem.sku is required,
    // 'undefined' found". Mirror Medusa's own canonical mapping
    // (@medusajs/core-flows order/workflows/create-fulfillment.js): sku =
    // variant_sku || "", barcode = variant_barcode || "", title = variant_title
    // ?? title, line_item_id = the order line item id. inventory_item_id is added
    // for managed variants (see above).
    // (Item weight is NOT needed here: build-payload already put
    // dhl_total_weight_grams on `data`, which the provider uses; the items-based
    // weight fallback only matters for a direct provider call outside the workflow.)
    const fulfillmentItems = (items as Array<Record<string, any>>).map((i) => ({
      line_item_id: i.id,
      inventory_item_id: invItemByLineItem.get(i.id),
      quantity: i.quantity,
      title: i.variant_title ?? i.title ?? "Item",
      sku: i.variant_sku || i.variant?.sku || "",
      barcode: i.variant_barcode || i.variant?.barcode || "",
    }))

    // Strip the id from the delivery address. Medusa inserts delivery_address as
    // a NEW FulfillmentAddress row; if we hand it the order address's own id it
    // reuses that id, so a second attempt (or a retry after the provider throws,
    // since the module rolls the fulfillment back but the address id stays
    // occupied) fails with "Fulfillment address with id ... already exists".
    // Medusa's canonical create-fulfillment does the same `delete address.id`.
    const deliveryAddress: Record<string, any> = { ...(input.delivery_address ?? {}) }
    delete deliveryAddress.id

    const fulfillmentService = container.resolve(Modules.FULFILLMENT)
    // Delegating to the standard Medusa fulfillment service ensures the
    // dhl-parcel provider is invoked via the proper module boundary and the
    // FulfillmentLabel rows are written natively (the provider returns labels[]
    // from createFulfillment).
    const fulfillment = await fulfillmentService.createFulfillment({
      location_id: stockLocations[0].id,
      // Medusa registers fulfillment providers under the COMPOSED id
      // `<config-id>_<service-identifier>` (both are "dhl-parcel" here), i.e.
      // "dhl-parcel_dhl-parcel" (verified in the fulfillment_provider table; the
      // seeded shipping options use the same value). Passing the bare "dhl-parcel"
      // fails provider resolution at the module boundary. Do NOT shorten this.
      provider_id: "dhl-parcel_dhl-parcel",
      delivery_address: deliveryAddress,
      items: fulfillmentItems,
      labels: [],
      // packed_at marks the fulfillment as packed so the order's aggregate
      // fulfillment_status counts it as "fulfilled" (Medusa's native
      // create-fulfillment sets this to now; the bare module call does not).
      packed_at: new Date(),
      // The fulfillment module forwards this `order` to the provider VERBATIM
      // (fulfillment-module-service.createFulfillment). The dhl-parcel provider
      // reads order.shipping_address (receiver), order.display_id (labelId +
      // REFERENCE) and order.email. Passing only { id } made it build an empty
      // receiver + uuidv5("undefined-1") labelId, which DHL rejected with 400.
      order: {
        id: input.order_id,
        display_id: input.order_display_id,
        email: input.order_email,
        shipping_address: input.delivery_address ?? {},
        // Seeds the deterministic labelId (provider step 2): order.id + attempt.
        label_attempt: input.order_label_attempt ?? 1,
      },
      data,
      metadata: {},
    } as any)
    return new StepResponse(fulfillment)
  },
)

export default callDhl
