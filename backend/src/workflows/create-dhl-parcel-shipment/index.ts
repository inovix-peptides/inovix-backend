import { createWorkflow, WorkflowResponse, transform } from "@medusajs/framework/workflows-sdk"
import validateOrder from "./steps/validate-order"
import buildPayload from "./steps/build-payload"
import callDhl from "./steps/call-dhl"
import persistLabel from "./steps/persist-label"
import registerOrderFulfillment from "./steps/register-order-fulfillment"

export type CreateDhlParcelShipmentInput = {
  order: any
  // Attempt number (1-based) used to seed a fresh DHL labelId on a redo after a
  // canceled label. Defaults to 1.
  labelAttempt?: number
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
      order_label_attempt: input.labelAttempt,
      payload,
      delivery_address: input.order.shipping_address,
    })
    const persisted: { fulfillment_id: string } = persistLabel({ fulfillment }) as any

    // Associate the fulfillment with the order: link + register so it shows in
    // the admin order page / widget and the order becomes "fulfilled". The bare
    // fulfillment module call in call-dhl does NOT do this on its own.
    const registerItems = transform({ order: input.order }, (d) =>
      (d.order.items ?? []).map((i: any) => ({ id: i.id, quantity: i.quantity }))
    )
    registerOrderFulfillment({
      order_id: input.order.id,
      fulfillment_id: persisted.fulfillment_id,
      items: registerItems,
    })

    return new WorkflowResponse({
      fulfillment_id: persisted.fulfillment_id,
      fulfillment,
    })
  },
)

export default createDhlParcelShipmentWorkflow
