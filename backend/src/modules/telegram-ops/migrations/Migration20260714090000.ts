import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20260714090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "telegram_ops_event" ("id" text not null, "key" text not null, "kind" text not null, "sent_at" timestamptz null, "snoozed_until" timestamptz null, "payload" jsonb null, "actor_id" text null, "actor_name" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "telegram_ops_event_pkey" primary key ("id"));`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_telegram_ops_event_key_unique" ON "telegram_ops_event" ("key") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_telegram_ops_event_deleted_at" ON "telegram_ops_event" ("deleted_at") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "telegram_ops_event" cascade;`)
  }
}
