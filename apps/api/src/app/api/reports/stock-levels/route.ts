import config from '@payload-config';
import { getPayload, type Where } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { isTenantUser, toID } from '@/lib/relations';

// Payload's REST list endpoint has no SUM/GROUP BY - "current stock" is by
// design never a stored column (spec Section 4: derived by summing the
// append-only StockMovements ledger), so this is the one place that has to
// aggregate it directly. Grouped by (store, product, variant) - a product
// with variants has genuinely separate stock per variant, not one blended
// number, so the key must include variant or two variants' movements would
// silently sum into a single figure neither one actually has.
export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const storeId = new URL(request.url).searchParams.get('store');
  const tenantId = toID(user.tenant);

  const where: Where = { tenant: { equals: tenantId } };
  if (storeId) where.store = { equals: storeId };

  const [movements, products] = await Promise.all([
    payload.find({ collection: 'stock-movements', where, pagination: false, depth: 0, overrideAccess: true }),
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

  const balances = new Map<string, number>();
  for (const m of movements.docs) {
    const variant = (m.variant as string | null) ?? '';
    const key = `${toID(m.store)}::${toID(m.product)}::${variant}`;
    balances.set(key, (balances.get(key) ?? 0) + (m.quantityDelta as number));
  }

  const levels = Array.from(balances.entries())
    // An archived product's past movements are still in the ledger (and
    // must stay there for history/reports), but nameByProduct only has
    // entries for the isActive-filtered products query above - this is
    // the actual exclusion, not just a cosmetic fallback.
    .filter(([key]) => nameByProduct.has(Number(key.split('::')[1])))
    .map(([key, quantity]) => {
      const [store, product, variant] = key.split('::');
      const productIdNum = Number(product);
      const reorderPoint = reorderPointByProduct.get(productIdNum) ?? 0;
      const variantId = variant || null;
      return {
        store: Number(store),
        product: productIdNum,
        variant: variantId,
        productName: nameByProduct.get(productIdNum) ?? `#${product}`,
        variantLabel: variantId ? (variantLabelByKey.get(`${productIdNum}::${variantId}`) ?? null) : null,
        quantity,
        reorderPoint,
        lowStock: quantity <= reorderPoint,
      };
    });

  return Response.json({ levels });
}
