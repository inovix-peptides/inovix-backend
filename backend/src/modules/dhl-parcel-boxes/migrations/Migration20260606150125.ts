import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260606150125 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "dhl_parcel_box_preset" drop constraint if exists "dhl_parcel_box_preset_parcel_type_key_check";`);

    this.addSql(`alter table if exists "dhl_parcel_box_preset" add constraint "dhl_parcel_box_preset_parcel_type_key_check" check("parcel_type_key" in ('XSMALL', 'SMALL', 'SMALL_MEDIUM', 'MEDIUM'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "dhl_parcel_box_preset" drop constraint if exists "dhl_parcel_box_preset_parcel_type_key_check";`);

    this.addSql(`alter table if exists "dhl_parcel_box_preset" add constraint "dhl_parcel_box_preset_parcel_type_key_check" check("parcel_type_key" in ('SMALL', 'MEDIUM', 'LARGE'));`);
  }

}
