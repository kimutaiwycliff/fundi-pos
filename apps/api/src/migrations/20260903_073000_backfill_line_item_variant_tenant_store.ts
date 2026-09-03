import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// The previous migration (20260903_064520) only added the tenant_id/
// store_id columns - it never populated them on rows that already
// existed, so every order/variant created before this pair of migrations
// deployed was still invisible to their PowerSync streams (empty
// receipts, profit stuck at whatever it was before, "missing" variant
// products) even after sync-config.yaml stopped joining. This backfills
// them once from their parent row, exactly what Orders.ts/Products.ts's
// beforeChange hooks now do automatically for every row going forward.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE orders_line_items AS oli
    SET tenant_id = o.tenant_id, store_id = o.store_id
    FROM orders AS o
    WHERE oli._parent_id = o.id AND oli.tenant_id IS NULL;

    UPDATE products_variants AS pv
    SET tenant_id = p.tenant_id
    FROM products AS p
    WHERE pv._parent_id = p.id AND pv.tenant_id IS NULL;
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Deliberately a no-op: reversing this would mean re-nulling tenant_id/
  // store_id on rows that were already correct going forward too (the
  // beforeChange hooks keep setting them on every new write), which would
  // just reintroduce the sync bug for no benefit. Nothing to undo safely.
}
