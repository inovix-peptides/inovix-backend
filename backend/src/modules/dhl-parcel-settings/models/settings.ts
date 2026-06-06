import { model } from '@medusajs/framework/utils'

export const DhlParcelSettings = model.define('dhl_parcel_settings', {
  id: model.id().primaryKey(),
  shipper_name: model.text(),
  shipper_street: model.text(),
  shipper_number: model.text().nullable(),
  shipper_postal_code: model.text(),
  shipper_city: model.text(),
  shipper_country_code: model.text().default('NL'),
  shipper_phone: model.text(),
  shipper_email: model.text(),
})
