import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

const persistLabel = createStep("persist-dhl-label", async (input: { fulfillment: any }) => {
  // Medusa creates FulfillmentLabel rows automatically when the provider returns
  // labels[] from createFulfillment. This step exists as an explicit hook so we
  // can extend with custom side-effects (e.g. R2 upload of the PDF) later
  // without rewriting the workflow signature.
  return new StepResponse({ fulfillment_id: input.fulfillment.id })
})

export default persistLabel
