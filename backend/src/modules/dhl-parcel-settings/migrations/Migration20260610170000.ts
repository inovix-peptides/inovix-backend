import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260610170000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "dhl_parcel_settings" add column if not exists "hide_sender" boolean not null default true;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "dhl_parcel_settings" drop column if exists "hide_sender";`);
  }

}
