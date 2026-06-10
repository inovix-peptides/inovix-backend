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
  // Free-shipping threshold in EUR major units, stored as text (like Medusa's
  // product.weight) and coerced with Number() on read. null/empty = no free
  // shipping. Changing it re-syncs a conditional €0 price on the DHL options.
  free_shipping_threshold: model.text().nullable(),
  // When true (default), the label flow adds the DHL "SSN" option so the sender
  // is hidden on the label (the recipient does not see who sent it). Free, NL.
  hide_sender: model.boolean().default(true),
})
