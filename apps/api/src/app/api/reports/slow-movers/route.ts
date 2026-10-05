import config from '@payload-config';
import { getPayload } from 'payload';
import { sql } from 'drizzle-orm';
import { headers as nextHeaders } from 'next/headers';
import { isTenantUser, toID } from '@/lib/relations';

interface ProductRow extends Record<string, unknown> {
  product_id: number;
  quantity: number;
  last_sold_at: string | null;
}

const ALLOWED_DAYS = new Set([30, 60, 90]);

// "What's sitting on the shelf not selling?" - products that still have
// stock but haven't sold in the last N days (or ever), with the cash tied
// up in them. Feeds the monthly clear-out / bundle decision (marketing plan
// §8). Products created inside the window are excluded so this week's new
// arrivals aren't flagged as dead stock just for being new.
export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get('days') ?? 60);
  const days = ALLOWED_DAYS.has(requestedDays) ? requestedDays : 60;
  const rawStoreId = url.searchParams.get('store');
  const storeId = rawStoreId != null && Number.isInteger(Number(rawStoreId)) ? Number(rawStoreId) : null;
  const tenantId = Number(toID(user.tenant));
  const canSeeCost = user.role === 'owner';
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const storeFilter = storeId != null ? sql`AND store_id = ${storeId}` : sql``;
  const [rows, products] = await Promise.all([
    payload.db.drizzle.execute<ProductRow>(sql`
      SELECT product_id,
             SUM(quantity_delta)::float8 AS quantity,
             MAX(CASE WHEN reason = 'sale' THEN created_at END) AS last_sold_at
      FROM stock_movements
      WHERE tenant_id = ${tenantId} ${storeFilter}
      GROUP BY product_id
    `),
    payload.find({
      collection: 'products',
      where: { tenant: { equals: tenantId }, isActive: { equals: true } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
  ]);

  const productById = new Map(products.docs.map((p) => [Number(p.id), p]));
  const items = rows.rows
    .map((row) => {
      const product = productById.get(Number(row.product_id));
      if (!product || !(row.quantity > 0)) return null;
      if (product.createdAt && new Date(product.createdAt as string) > cutoff) return null;
      const lastSoldAt = row.last_sold_at ? new Date(row.last_sold_at) : null;
      if (lastSoldAt && lastSoldAt >= cutoff) return null;
      const sellPrice = Number(product.sellPrice ?? 0);
      const costPrice = Number(product.costPrice ?? 0);
      return {
        product: Number(product.id),
        name: product.name as string,
        category: (product.category as string | null) || 'Uncategorized',
        quantity: row.quantity,
        lastSoldAt: lastSoldAt ? lastSoldAt.toISOString() : null,
        daysSinceLastSale: lastSoldAt ? Math.floor((Date.now() - lastSoldAt.getTime()) / (24 * 60 * 60 * 1000)) : null,
        retailValue: Math.round(row.quantity * sellPrice * 100) / 100,
        costValue: canSeeCost ? Math.round(row.quantity * costPrice * 100) / 100 : null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.retailValue - a.retailValue);

  return Response.json({
    days,
    items,
    totalRetailValue: items.reduce((sum, i) => sum + i.retailValue, 0),
    totalCostValue: canSeeCost ? items.reduce((sum, i) => sum + (i.costValue ?? 0), 0) : null,
  });
}
