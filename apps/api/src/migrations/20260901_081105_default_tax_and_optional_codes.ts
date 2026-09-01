import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products_variants" ALTER COLUMN "sku" DROP NOT NULL;
  ALTER TABLE "products" ALTER COLUMN "sku" DROP NOT NULL;
  ALTER TABLE "products" ALTER COLUMN "tax_rate" SET DEFAULT 0;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products_variants" ALTER COLUMN "sku" SET NOT NULL;
  ALTER TABLE "products" ALTER COLUMN "sku" SET NOT NULL;
  ALTER TABLE "products" ALTER COLUMN "tax_rate" SET DEFAULT 0.16;`)
}
