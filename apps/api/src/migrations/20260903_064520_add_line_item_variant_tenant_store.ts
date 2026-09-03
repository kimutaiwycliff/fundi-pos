import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products_variants" ADD COLUMN "tenant_id" numeric;
  ALTER TABLE "orders_line_items" ADD COLUMN "tenant_id" numeric;
  ALTER TABLE "orders_line_items" ADD COLUMN "store_id" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products_variants" DROP COLUMN "tenant_id";
  ALTER TABLE "orders_line_items" DROP COLUMN "tenant_id";
  ALTER TABLE "orders_line_items" DROP COLUMN "store_id";`)
}
