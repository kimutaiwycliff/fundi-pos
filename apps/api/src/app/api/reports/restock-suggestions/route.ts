import config from '@payload-config';
import { getPayload, type Where } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { isTenantUser, toID } from '@/lib/relations';

// Suggests what to restock for a store: products at or below their reorder
// point (same derived-from-stock-movements computation as
// /api/reports/stock-levels), unioned with the store's fastest-moving
// products by quantity sold over the window (adapted from
// salesAggregate.ts's topProducts, which is revenue-sorted and capped at 10 -
// this needs quantity-sorted and a wider/adjustable cap for a picker, not a
// dashboard widget). costPrice/estimatedCost are only included for owners,
// mirroring Products.ts's own field-level access rule (bypassed by
// overrideAccess below, so it has to be re-applied by hand here).
export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'owner' && user.role !== 'manager') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const storeId = url.searchParams.get('store');
  if (!storeId) {
    return Response.json({ error: 'store is required' }, { status: 400 });
  }
  const windowDays = Number(url.searchParams.get('windowDays') ?? '30') || 30;
  const canSeeCost = user.role === 'owner';
  const tenantId = toID(user.tenant);

  const [movements, products, orders] = await Promise.all([
    payload.find({
      collection: 'stock-movements',
      where: { tenant: { equals: tenantId }, store: { equals: storeId } } as Where,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'products',
      where: { tenant: { equals: tenantId } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'orders',
      where: {
        tenant: { equals: tenantId },
        store: { equals: storeId },
        createdAt: { greater_than_equal: new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString() },
      } as Where,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
  ]);

  const productById = new Map(products.docs.map((p) => [p.id, p]));

  // Current stock per (product, variant) at this store - same running-sum
  // approach as /api/reports/stock-levels, just pre-scoped to one store.
  const balances = new Map<string, number>();
  for (const m of movements.docs) {
    const variant = (m.variant as string | null) ?? '';
    const key = `${toID(m.product)}::${variant}`;
    balances.set(key, (balances.get(key) ?? 0) + (m.quantityDelta as number));
  }

  // Quantity sold per (product, variant) at this store in the window.
  const soldQuantity = new Map<string, number>();
  for (const order of orders.docs) {
    if (order.status !== 'completed') continue;
    for (const line of (order.lineItems ?? []) as Array<{ product: unknown; variant?: string | null; quantity: number }>) {
      const variant = line.variant ?? '';
      const key = `${toID(line.product)}::${variant}`;
      soldQuantity.set(key, (soldQuantity.get(key) ?? 0) + line.quantity);
    }
  }

  const keys = new Set([...balances.keys(), ...soldQuantity.keys()]);
  const candidates = Array.from(keys).map((key) => {
    const [productIdStr, variant] = key.split('::');
    const productId = Number(productIdStr);
    const product = productById.get(productId);
    const variantId = variant || null;
    const variantDoc = variantId
      ? ((product?.variants ?? []) as Array<{ id?: string; label: string; costPrice?: number; sellPrice?: number }>).find(
          (v) => v.id === variantId,
        )
      : null;

    const reorderPoint = (product?.reorderPoint as number) ?? 0;
    const currentStock = balances.get(key) ?? 0;
    const quantitySold = soldQuantity.get(key) ?? 0;
    const lowStock = currentStock <= reorderPoint;

    const costPrice = canSeeCost ? (variantDoc?.costPrice ?? (product?.costPrice as number) ?? 0) : null;
    const sellPrice = variantDoc?.sellPrice ?? (product?.sellPrice as number) ?? 0;

    return {
      productId,
      variant: variantId,
      productName: product?.name ?? `#${productId}`,
      variantLabel: variantDoc?.label ?? null,
      currentStock,
      reorderPoint,
      quantitySoldInWindow: quantitySold,
      costPrice,
      sellPrice,
      lowStock,
    };
  });

  // Fast-moving = top 20 by quantity sold in the window, regardless of
  // stock level - deliberately a separate ranking from lowStock so a
  // product can appear as both signals at once.
  const fastMovingIds = new Set(
    candidates
      .filter((c) => c.quantitySoldInWindow > 0)
      .sort((a, b) => b.quantitySoldInWindow - a.quantitySoldInWindow)
      .slice(0, 20)
      .map((c) => `${c.productId}::${c.variant ?? ''}`),
  );

  const suggestions = candidates
    .filter((c) => c.lowStock || fastMovingIds.has(`${c.productId}::${c.variant ?? ''}`))
    .map((c) => ({
      ...c,
      reason: c.lowStock && fastMovingIds.has(`${c.productId}::${c.variant ?? ''}`)
        ? ('both' as const)
        : c.lowStock
          ? ('low-stock' as const)
          : ('fast-moving' as const),
    }))
    .sort((a, b) => (a.reason === 'both' ? -1 : 0) - (b.reason === 'both' ? -1 : 0));

  return Response.json({ suggestions });
}
