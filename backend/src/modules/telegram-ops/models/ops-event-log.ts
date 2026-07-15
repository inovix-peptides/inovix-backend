import { model } from '@medusajs/framework/utils'

// One row per notification/action. `key` is the idempotency key (unique):
// an insert conflict means "already sent/done, skip". actor_* are filled for
// operator-initiated actions (phase 2 audit trail; Medusa itself has no
// audit log for inventory changes, so this table is the system of record).
export const TelegramOpsEvent = model
  .define('telegram_ops_event', {
    id: model.id().primaryKey(),
    key: model.text(),
    kind: model.text(),
    sent_at: model.dateTime().nullable(),
    snoozed_until: model.dateTime().nullable(),
    payload: model.json().nullable(),
    actor_id: model.text().nullable(),
    actor_name: model.text().nullable(),
  })
  .indexes([{ on: ['key'], unique: true }])
