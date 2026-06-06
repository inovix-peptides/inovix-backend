import { model } from '@medusajs/framework/utils'

export const DhlParcelBoxPreset = model.define('dhl_parcel_box_preset', {
  id: model.id().primaryKey(),
  name: model.text(),
  length_cm: model.number(),
  width_cm: model.number(),
  height_cm: model.number(),
  max_items: model.number(),
  // Real DHL keys (confirmed 2026-06-06 via /capabilities/business):
  // XSMALL (0-2kg), SMALL (0-10kg), SMALL_MEDIUM (10-20kg), MEDIUM (20-31kg).
  // 'LARGE' does NOT exist in DHL's API; was removed here.
  // TODO(Task 22): write a new migration to ALTER the enum in the DB column.
  //   The existing migration 1748956218885_CreateDhlParcelBoxPreset.ts used
  //   CHECK CONSTRAINT with the old values. A follow-up migration must drop the
  //   old constraint and add the corrected one before going live.
  parcel_type_key: model.enum(['XSMALL', 'SMALL', 'SMALL_MEDIUM', 'MEDIUM']),
})
