import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import validateOrder from "./steps/validate-order"
import buildPayload from "./steps/build-payload"
import callDhl from "./steps/call-dhl"
import persistLabel from "./steps/persist-label"

export type CreateDhlParcelShipmentInput = {
  order: any
}

export const createDhlParcelShipmentWorkflow = createWorkflow(
  "create-dhl-parcel-shipment",
  (input: CreateDhlParcelShipmentInput) => {
    validateOrder({ order: input.order })
    const payload = buildPayload({ order: input.order })
    const fulfillment = callDhl({
      order_id: input.order.id,
      order_display_id: input.order.display_id,
      order_email: input.order.email,
      payload,
      delivery_address: input.order.shipping_address,
    })
    const persisted: { fulfillment_id: string } = persistLabel({ fulfillment }) as any
    return new WorkflowResponse({
      fulfillment_id: persisted.fulfillment_id,
      fulfillment,
    })
  },
)

export default createDhlParcelShipmentWorkflow
