import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products_variants" ADD COLUMN "sell_price" numeric;
  ALTER TABLE "products_variants" ADD COLUMN "cost_price" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products_variants" DROP COLUMN "sell_price";
  ALTER TABLE "products_variants" DROP COLUMN "cost_price";`)
}
