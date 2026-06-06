import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules, MedusaError } from "@medusajs/framework/utils"

export type CallDhlInput = {
  order_id: string
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

    const fulfillmentService = container.resolve(Modules.FULFILLMENT)
    // Delegating to the standard Medusa fulfillment service ensures the
    // dhl-parcel provider is invoked via the proper module boundary and the
    // FulfillmentLabel rows are written natively (the provider returns labels[]
    // from createFulfillment). Payload shape mirrors the proven old DHL Express
    // call-dhl step.
    const fulfillment = await fulfillmentService.createFulfillment({
      location_id: stockLocations[0].id,
      // Medusa registers fulfillment providers under the COMPOSED id
      // `<config-id>_<service-identifier>` (both are "dhl-parcel" here), i.e.
      // "dhl-parcel_dhl-parcel" (verified in the fulfillment_provider table; the
      // seeded shipping options use the same value). Passing the bare "dhl-parcel"
      // fails provider resolution at the module boundary. Do NOT shorten this.
      provider_id: "dhl-parcel_dhl-parcel",
      delivery_address: input.delivery_address ?? {},
      items,
      labels: [],
      order: { id: input.order_id },
      data,
      metadata: {},
    } as any)
    return new StepResponse(fulfillment)
  },
)

export default callDhl
