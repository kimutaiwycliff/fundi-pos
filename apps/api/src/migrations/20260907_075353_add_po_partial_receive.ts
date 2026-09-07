import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_purchase_orders_status" ADD VALUE 'partially_received' BEFORE 'received';
  ALTER TABLE "purchase_orders_line_items" ADD COLUMN "received_quantity" numeric DEFAULT 0 NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'draft'::text;
  DROP TYPE "public"."enum_purchase_orders_status";
  CREATE TYPE "public"."enum_purchase_orders_status" AS ENUM('draft', 'sent', 'received');
  ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."enum_purchase_orders_status";
  ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DATA TYPE "public"."enum_purchase_orders_status" USING "status"::"public"."enum_purchase_orders_status";
  ALTER TABLE "purchase_orders_line_items" DROP COLUMN "received_quantity";`)
}
