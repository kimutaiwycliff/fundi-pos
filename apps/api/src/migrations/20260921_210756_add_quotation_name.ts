import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "quotations" ADD COLUMN "name" varchar;`)
  // Backfill existing rows so nothing shows blank until next edited -
  // same "CustomerName - Date" format the collection's own beforeChange
  // hook computes going forward (FM suppresses to_char's default
  // zero-padded day, matching toLocaleDateString's non-padded output).
  await db.execute(sql`
   UPDATE "quotations"
   SET "name" = COALESCE(NULLIF(TRIM("customer_name"), ''), 'Walk-in') || ' - ' || TO_CHAR("created_at", 'FMDD Mon YYYY')
   WHERE "name" IS NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "quotations" DROP COLUMN "name";`)
}
