import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// The columns added by 20260903_064520 were created as `numeric` - Payload's
// default Postgres type for a plain `type: 'number'` field - instead of
// `integer` like every other working tenant/store column (orders.tenant_id,
// products.tenant_id, etc). PowerSync's bucket-key computation derives a
// different key from a `numeric` column's replicated value than from an
// `integer` one for the exact same logical value, so the sync-config.yaml
// fix in the same commit never actually worked: verified live against a
// real local Postgres + PowerSync instance (raw /sync/stream call) that
// orders_line_items/products_variants bucket counts stayed at 0 with the
// numeric columns, and jumped to the correct counts immediately after
// converting them to integer - the same failure shape already documented
// in apps/api/src/lib/powersyncAuth.ts for JWT claims, just on the
// replicated-column side instead of the token-claim side this time.
//
// A bare ALTER COLUMN TYPE doesn't generate a replicable row event on its
// own (confirmed live: PowerSync logged "Sync config unchanged" / "Initial
// replication already done" and served stale data until a real row UPDATE
// followed) - the no-op UPDATEs below force one so PowerSync re-derives
// bucket keys for every existing row, not just future writes.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "orders_line_items" ALTER COLUMN "tenant_id" TYPE integer USING "tenant_id"::integer;
    ALTER TABLE "orders_line_items" ALTER COLUMN "store_id" TYPE integer USING "store_id"::integer;
    ALTER TABLE "products_variants" ALTER COLUMN "tenant_id" TYPE integer USING "tenant_id"::integer;

    UPDATE "orders_line_items" SET "tenant_id" = "tenant_id";
    UPDATE "products_variants" SET "tenant_id" = "tenant_id";
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "orders_line_items" ALTER COLUMN "tenant_id" TYPE numeric;
    ALTER TABLE "orders_line_items" ALTER COLUMN "store_id" TYPE numeric;
    ALTER TABLE "products_variants" ALTER COLUMN "tenant_id" TYPE numeric;
  `)
}
