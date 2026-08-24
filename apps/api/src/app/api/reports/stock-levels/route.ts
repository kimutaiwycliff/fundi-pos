import config from '@payload-config';
import { getPayload, type Where } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { toID } from '@/lib/relations';

// Payload's REST list endpoint has no SUM/GROUP BY - "current stock" is by
// design never a stored column (spec Section 4: derived by summing the
// append-only StockMovements ledger), so this is the one place that has to
// aggregate it directly.
export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const storeId = new URL(request.url).searchParams.get('store');
  const tenantId = toID(user.tenant);

  const where: Where = { tenant: { equals: tenantId } };
  if (storeId) where.store = { equals: storeId };

  const [movements, products] = await Promise.all([
    payload.find({ collection: 'stock-movements', where, pagination: false, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'products', where: { tenant: { equals: tenantId } }, pagination: false, depth: 0, overrideAccess: true }),
  ]);

  const reorderPointByProduct = new Map(products.docs.map((p) => [p.id, (p.reorderPoint as number) ?? 0]));
  const nameByProduct = new Map(products.docs.map((p) => [p.id, p.name as string]));

  const balances = new Map<string, number>();
  for (const m of movements.docs) {
    const key = `${toID(m.store)}::${toID(m.product)}`;
    balances.set(key, (balances.get(key) ?? 0) + (m.quantityDelta as number));
  }

  const levels = Array.from(balances.entries()).map(([key, quantity]) => {
    const [store, product] = key.split('::');
    const productIdNum = Number(product);
    const reorderPoint = reorderPointByProduct.get(productIdNum) ?? 0;
    return {
      store: Number(store),
      product: productIdNum,
      productName: nameByProduct.get(productIdNum) ?? `#${product}`,
      quantity,
      reorderPoint,
      lowStock: quantity <= reorderPoint,
    };
  });

  return Response.json({ levels });
}
