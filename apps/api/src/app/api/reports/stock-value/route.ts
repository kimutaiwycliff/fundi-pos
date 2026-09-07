import config from '@payload-config';
import { getPayload, type Where } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { isTenantUser, toID } from '@/lib/relations';

// Point-in-time snapshot of unsold stock, distinct from salesAggregate.ts's
// profitTotal (which is REALIZED profit from actual sales in a date range).
// Same derived-from-stock-movements balance computation as
// /api/reports/stock-levels, joined with each product/variant's
// costPrice/sellPrice the same way restock-suggestions already does -
// deliberately a separate lean endpoint rather than changing stock-levels'
// existing response shape, which several other pages already depend on.
export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const storeId = new URL(request.url).searchParams.get('store');
  const canSeeCost = user.role === 'owner';
  const tenantId = toID(user.tenant);

  const where: Where = { tenant: { equals: tenantId } };
  if (storeId) where.store = { equals: storeId };

  const [movements, products] = await Promise.all([
    payload.find({ collection: 'stock-movements', where, pagination: false, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'products', where: { tenant: { equals: tenantId } }, pagination: false, depth: 0, overrideAccess: true }),
  ]);

  const productById = new Map(products.docs.map((p) => [p.id, p]));

  const balances = new Map<string, number>();
  for (const m of movements.docs) {
    const variant = (m.variant as string | null) ?? '';
    const key = `${toID(m.product)}::${variant}`;
    balances.set(key, (balances.get(key) ?? 0) + (m.quantityDelta as number));
  }

  let stockValue = 0;
  let potentialRevenue = 0;
  for (const [key, quantity] of balances) {
    if (quantity <= 0) continue;
    const [productIdStr, variant] = key.split('::');
    const product = productById.get(Number(productIdStr));
    const variantDoc = variant
      ? ((product?.variants ?? []) as Array<{ id?: string; costPrice?: number; sellPrice?: number }>).find((v) => v.id === variant)
      : null;
    const costPrice = variantDoc?.costPrice ?? (product?.costPrice as number) ?? 0;
    const sellPrice = variantDoc?.sellPrice ?? (product?.sellPrice as number) ?? 0;
    stockValue += costPrice * quantity;
    potentialRevenue += sellPrice * quantity;
  }

  return Response.json({
    potentialRevenue,
    stockValue: canSeeCost ? stockValue : null,
    potentialProfit: canSeeCost ? potentialRevenue - stockValue : null,
  });
}
