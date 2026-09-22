import config from '@payload-config';
import { getPayload } from 'payload';
import { sql } from 'drizzle-orm';
import { headers as nextHeaders } from 'next/headers';
import { isTenantUser, toID } from '@/lib/relations';

interface BalanceRow extends Record<string, unknown> {
  store_id: number;
  product_id: number;
  variant: string | null;
  quantity: number;
}

// Payload's REST list endpoint has no SUM/GROUP BY - "current stock" is by
// design never a stored column (spec Section 4: derived by summing the
// append-only StockMovements ledger). Aggregated in SQL (not fetched in
// full and reduced in JS, as this endpoint originally did) - this is now
// called from nearly every mobile/desktop screen (fetchStockLevels), and
// pulling every movement row ever recorded for a tenant on every call
// doesn't scale with the ledger's size. Grouped by (store, product,
// variant) - a product with variants has genuinely separate stock per
// variant, not one blended number, so the key must include variant or two
// variants' movements would silently sum into a single figure neither one
// actually has. ::float8 cast guarantees a real JS number back from
// Postgres's `numeric` column (which the driver would otherwise return as
// a string, to avoid precision loss on values too big for a float).
export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rawStoreId = new URL(request.url).searchParams.get('store');
  const storeId = rawStoreId != null && Number.isInteger(Number(rawStoreId)) ? Number(rawStoreId) : null;
  const tenantId = toID(user.tenant);

  const [balances, products] = await Promise.all([
    payload.db.drizzle.execute<BalanceRow>(
      storeId != null
        ? sql`SELECT store_id, product_id, variant, SUM(quantity_delta)::float8 AS quantity
              FROM stock_movements
              WHERE tenant_id = ${tenantId} AND store_id = ${storeId}
              GROUP BY store_id, product_id, variant`
        : sql`SELECT store_id, product_id, variant, SUM(quantity_delta)::float8 AS quantity
              FROM stock_movements
              WHERE tenant_id = ${tenantId}
              GROUP BY store_id, product_id, variant`,
    ),
    // isActive filtered here so archived products drop out of the levels
    // below entirely (via the nameByProduct.has() check), not just lose
    // their display name - this endpoint previously had no archive
    // awareness at all, which is why an archived product kept showing up
    // in Inventory (both Web and Desktop read this same endpoint).
    payload.find({
      collection: 'products',
      where: { tenant: { equals: tenantId }, isActive: { equals: true } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
  ]);

  const reorderPointByProduct = new Map(products.docs.map((p) => [p.id, (p.reorderPoint as number) ?? 0]));
  const nameByProduct = new Map(products.docs.map((p) => [p.id, p.name as string]));
  const variantLabelByKey = new Map<string, string>();
  for (const p of products.docs) {
    const variants = (p.variants ?? []) as Array<{ id?: string; label: string }>;
    for (const v of variants) {
      if (v.id) variantLabelByKey.set(`${p.id}::${v.id}`, v.label);
    }
  }

  const levels = balances.rows
    // An archived product's past movements are still in the ledger (and
    // must stay there for history/reports), but nameByProduct only has
    // entries for the isActive-filtered products query above - this is
    // the actual exclusion, not just a cosmetic fallback.
    .filter((row) => nameByProduct.has(row.product_id))
    .map((row) => {
      const reorderPoint = reorderPointByProduct.get(row.product_id) ?? 0;
      return {
        store: row.store_id,
        product: row.product_id,
        variant: row.variant,
        productName: nameByProduct.get(row.product_id) ?? `#${row.product_id}`,
        variantLabel: row.variant ? (variantLabelByKey.get(`${row.product_id}::${row.variant}`) ?? null) : null,
        quantity: row.quantity,
        reorderPoint,
        lowStock: row.quantity <= reorderPoint,
      };
    });

  return Response.json({ levels });
}
