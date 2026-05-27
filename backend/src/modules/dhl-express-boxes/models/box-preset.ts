import { model } from "@medusajs/framework/utils"

export const DhlBoxPreset = model.define("dhl_box_preset", {
  id: model.id().primaryKey(),
  name: model.text().searchable(),
  length_cm: model.number(),
  width_cm: model.number(),
  height_cm: model.number(),
  max_items: model.number(),
})
