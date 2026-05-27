import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { sumOrderWeightKg, suggestBox, type BoxPreset } from "../../../modules/dhl-express/box-selector"

export type BuildPayloadInput = {
  order: any
  boxes: BoxPreset[]
  overrideBoxId?: string
  productCode: "H" | "P"
}

const buildPayload = createStep("build-dhl-payload", async (input: BuildPayloadInput) => {
  const totalUnits = input.order.items.reduce((s: number, it: any) => s + it.quantity, 0)
  const box = input.overrideBoxId
    ? input.boxes.find((b) => b.id === input.overrideBoxId)!
    : suggestBox(input.boxes, totalUnits)
  const weightKg = sumOrderWeightKg(input.order.items.map((it: any) => ({
    quantity: it.quantity, product: it.product,
  })))

  const messageReference =
    `inovix-${input.order.display_id}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`

  return new StepResponse({
    dhl_product_code: input.productCode,
    dhl_request_id: messageReference,
    dhl_box_preset_id: box.id,
    dhl_box_dimensions: { lengthCm: box.lengthCm, widthCm: box.widthCm, heightCm: box.heightCm },
    dhl_total_weight_kg: weightKg,
  })
})

export default buildPayload
