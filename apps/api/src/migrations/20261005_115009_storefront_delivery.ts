import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "tenants_delivery_zones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"fee" numeric NOT NULL,
  	"eta" varchar
  );
  
  ALTER TABLE "tenants" ADD COLUMN "free_delivery_threshold" numeric;
  ALTER TABLE "tenants" ADD COLUMN "pay_on_delivery" boolean DEFAULT false;
  ALTER TABLE "tenants" ADD COLUMN "same_day_cutoff" varchar;
  ALTER TABLE "tenants" ADD COLUMN "same_day_area" varchar;
  ALTER TABLE "tenants_delivery_zones" ADD CONSTRAINT "tenants_delivery_zones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tenants_delivery_zones_order_idx" ON "tenants_delivery_zones" USING btree ("_order");
  CREATE INDEX "tenants_delivery_zones_parent_id_idx" ON "tenants_delivery_zones" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "tenants_delivery_zones" CASCADE;
  ALTER TABLE "tenants" DROP COLUMN "free_delivery_threshold";
  ALTER TABLE "tenants" DROP COLUMN "pay_on_delivery";
  ALTER TABLE "tenants" DROP COLUMN "same_day_cutoff";
  ALTER TABLE "tenants" DROP COLUMN "same_day_area";`)
}
