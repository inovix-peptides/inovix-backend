import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

const persistLabel = createStep(
  "persist-dhl-parcel-label",
  async (input: { fulfillment: { id: string } }) => {
    // Pass-through. The dhl-parcel provider already persisted the tracking
    // number + label via Medusa's native FulfillmentLabel mechanism (it returns
    // labels[] from createFulfillment). This step is an explicit hook so we can
    // add side-effects later (e.g. R2 upload of the PDF) without changing the
    // workflow signature.
    return new StepResponse({ fulfillment_id: input.fulfillment.id })
  },
)

export default persistLabel
