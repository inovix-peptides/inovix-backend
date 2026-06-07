import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260607150000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "dhl_parcel_settings" add column if not exists "free_shipping_threshold" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "dhl_parcel_settings" drop column if exists "free_shipping_threshold";`);
  }

}
