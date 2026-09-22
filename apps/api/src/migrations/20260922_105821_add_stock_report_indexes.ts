import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Indexes the actual query patterns in /api/reports/stock-levels (now doing
// its own SUM/GROUP BY in SQL, see that route's own comment) and the
// checkout hot path's stock-movement writes (Orders.ts's afterChange hook)
// were missing. stock_movements already had single-column btree indexes on
// tenant_id/store_id/product_id (initial baseline migration) - `variant`
// itself was never indexed despite being part of this endpoint's own
// GROUP BY key, and a composite covering all three of the endpoint's WHERE/
// GROUP BY columns together lets Postgres satisfy the query from one index
// scan instead of bitmap-ANDing three separate single-column indexes.
// products had tenant_id and is_active indexed separately (different
// migrations) but never together, despite every catalog fetch
// (fetchCatalog on every platform) filtering on exactly that pair.
// orders_line_items.tenant_id/store_id (added later, see
// 20260903_064520_add_line_item_variant_tenant_store.ts) were never
// indexed at all.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX IF NOT EXISTS "stock_movements_variant_idx" ON "stock_movements" USING btree ("variant");
   CREATE INDEX IF NOT EXISTS "stock_movements_tenant_store_product_idx" ON "stock_movements" USING btree ("tenant_id", "store_id", "product_id");
   CREATE INDEX IF NOT EXISTS "products_tenant_active_idx" ON "products" USING btree ("tenant_id", "is_active");
   CREATE INDEX IF NOT EXISTS "orders_line_items_tenant_idx" ON "orders_line_items" USING btree ("tenant_id");
   CREATE INDEX IF NOT EXISTS "orders_line_items_store_idx" ON "orders_line_items" USING btree ("store_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "stock_movements_variant_idx";
   DROP INDEX IF EXISTS "stock_movements_tenant_store_product_idx";
   DROP INDEX IF EXISTS "products_tenant_active_idx";
   DROP INDEX IF EXISTS "orders_line_items_tenant_idx";
   DROP INDEX IF EXISTS "orders_line_items_store_idx";`)
}
