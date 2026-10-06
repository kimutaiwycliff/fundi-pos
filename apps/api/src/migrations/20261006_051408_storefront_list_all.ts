import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tenants" ADD COLUMN "storefront_list_all" boolean DEFAULT false;
  ALTER TABLE "products" ADD COLUMN "hide_online" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tenants" DROP COLUMN "storefront_list_all";
  ALTER TABLE "products" DROP COLUMN "hide_online";`)
}
