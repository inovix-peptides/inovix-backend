import { model } from '@medusajs/framework/utils'

export const DhlParcelBoxPreset = model.define('dhl_parcel_box_preset', {
  id: model.id().primaryKey(),
  name: model.text(),
  length_cm: model.number(),
  width_cm: model.number(),
  height_cm: model.number(),
  max_items: model.number(),
  parcel_type_key: model.enum(['SMALL', 'MEDIUM', 'LARGE']),
})
