import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260606194451 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "dhl_parcel_settings" ("id" text not null, "shipper_name" text not null, "shipper_street" text not null, "shipper_number" text null, "shipper_postal_code" text not null, "shipper_city" text not null, "shipper_country_code" text not null default 'NL', "shipper_phone" text not null, "shipper_email" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "dhl_parcel_settings_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dhl_parcel_settings_deleted_at" ON "dhl_parcel_settings" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "dhl_parcel_settings" cascade;`);
  }

}
