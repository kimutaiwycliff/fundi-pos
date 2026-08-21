import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { toID } from '@/lib/relations';

export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const storeId = url.searchParams.get('store');
  const tenantId = toID(user.tenant);

  const where: Record<string, unknown> = {
    tenant: { equals: tenantId },
    status: { equals: 'completed' },
  };
  if (storeId) where.store = { equals: storeId };

  const orders = await payload.find({
    collection: 'orders',
    where,
    pagination: false,
    depth: 1, // populate lineItems.product for names below
    overrideAccess: true,
  });

  let totalSales = 0;
  let totalTax = 0;
  let orderCount = orders.docs.length;
  const revenueByProduct = new Map<string, { name: string; revenue: number; quantity: number }>();
  const revenueByStore = new Map<string, number>();

  for (const order of orders.docs) {
    totalSales += (order.total as number) ?? 0;
    totalTax += (order.taxTotal as number) ?? 0;
    const storeKey = String(toID(order.store));
    revenueByStore.set(storeKey, (revenueByStore.get(storeKey) ?? 0) + ((order.total as number) ?? 0));

    const lineItems = (order.lineItems ?? []) as Array<{
      product: { id: number; name: string } | number;
      quantity: number;
      unitPrice: number;
      discount: number;
    }>;
    for (const line of lineItems) {
      const productId = String(toID(line.product));
      const name = typeof line.product === 'object' ? line.product.name : `#${line.product}`;
      const revenue = line.quantity * line.unitPrice - line.discount;
      const existing = revenueByProduct.get(productId);
      revenueByProduct.set(productId, {
        name,
        revenue: (existing?.revenue ?? 0) + revenue,
        quantity: (existing?.quantity ?? 0) + line.quantity,
      });
    }
  }

  const topProducts = Array.from(revenueByProduct.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return Response.json({
    totalSales,
    totalTax,
    orderCount,
    topProducts,
    byStore: Array.from(revenueByStore.entries()).map(([store, revenue]) => ({ store: Number(store), revenue })),
  });
}
