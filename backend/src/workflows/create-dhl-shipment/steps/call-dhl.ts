import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"

export type CallDhlInput = {
  order_id: string
  fulfillmentData: any
}

const callDhl = createStep("call-dhl-create-shipment", async (input: CallDhlInput, { container }: any) => {
  const fulfillmentService = container.resolve(Modules.FULFILLMENT)
  // Delegating to the standard Medusa fulfillment service ensures the provider
  // module is invoked via the proper module boundary and the FulfillmentLabel
  // rows are written natively.
  const stockLocations = (await fulfillmentService.listStockLocations?.({})) ?? []
  const fulfillment = await fulfillmentService.createFulfillment({
    location_id: stockLocations[0]?.id,
    provider_id: "dhl-express",
    delivery_address: {},
    items: [],
    labels: [],
    order: { id: input.order_id },
    data: input.fulfillmentData,
    metadata: {},
  } as any)
  return new StepResponse(fulfillment)
})

export default callDhl
