import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260527174249 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "dhl_box_preset" ("id" text not null, "name" text not null, "length_cm" integer not null, "width_cm" integer not null, "height_cm" integer not null, "max_items" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "dhl_box_preset_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dhl_box_preset_deleted_at" ON "dhl_box_preset" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "dhl_box_preset" cascade;`);
  }

}
