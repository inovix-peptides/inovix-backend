import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import validateOrder from "./steps/validate-order"
import buildPayload from "./steps/build-payload"
import callDhl from "./steps/call-dhl"
import persistLabel from "./steps/persist-label"

export type CreateDhlShipmentInput = {
  order: any
  boxes: any[]
  overrideBoxId?: string
}

export const createDhlShipmentWorkflow = createWorkflow(
  "create-dhl-shipment",
  (input: CreateDhlShipmentInput) => {
    const validated = validateOrder({ order: input.order, boxes: input.boxes })
    const payload = buildPayload({
      order: input.order,
      boxes: input.boxes,
      overrideBoxId: input.overrideBoxId,
      productCode: (validated as any).dhl_product_code,
    })
    const fulfillment = callDhl({ order_id: input.order.id, fulfillmentData: payload })
    const persisted = persistLabel({ fulfillment })
    return new WorkflowResponse({ fulfillment, persisted })
  },
)

export default createDhlShipmentWorkflow
