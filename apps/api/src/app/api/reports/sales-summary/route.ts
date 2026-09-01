import config from '@payload-config';
import { getPayload, type Where } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { isTenantUser, toID } from '@/lib/relations';

export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const storeId = url.searchParams.get('store');
  const range = url.searchParams.get('range') ?? 'all'; // today | 7d | 30d | all
  const tenantId = toID(user.tenant);

  const where: Where = {
    tenant: { equals: tenantId },
    status: { equals: 'completed' },
  };
  if (storeId) where.store = { equals: storeId };
  const since = rangeStart(range);
  if (since) where.createdAt = { greater_than_equal: since };

  const orders = await payload.find({
    collection: 'orders',
    where,
    pagination: false,
    depth: 1, // populate lineItems.product (name, and costPrice via overrideAccess) for below
    overrideAccess: true,
  });

  // Cost/profit is owner-only (Products.costPrice's own field access already
  // strips it from non-owner API calls elsewhere - this route bypasses that
  // via overrideAccess to compute the aggregate, so it must re-apply the
  // same rule itself before deciding what to put in the response).
  const canSeeProfit = user.role === 'owner';

  let totalSales = 0;
  let totalTax = 0;
  let profitTotal = 0;
  const orderCount = orders.docs.length;
  const revenueByProduct = new Map<string, { name: string; revenue: number; quantity: number }>();
  const revenueByStore = new Map<string, number>();
  const totalsByTender = { cash: 0, mpesa: 0, card: 0, credit: 0 };

  for (const order of orders.docs) {
    const orderTotal = (order.total as number) ?? 0;
    totalSales += orderTotal;
    totalTax += (order.taxTotal as number) ?? 0;
    const storeKey = String(toID(order.store));
    revenueByStore.set(storeKey, (revenueByStore.get(storeKey) ?? 0) + orderTotal);
    const tender = order.tenderType as 'cash' | 'mpesa' | 'card' | 'credit' | undefined;
    if (tender && tender in totalsByTender) totalsByTender[tender] += orderTotal;

    const lineItems = (order.lineItems ?? []) as Array<{
      product: { id: number; name: string; costPrice?: number } | number;
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
      if (canSeeProfit && typeof line.product === 'object' && typeof line.product.costPrice === 'number') {
        profitTotal += revenue - line.product.costPrice * line.quantity;
      }
    }
  }

  const topProducts = Array.from(revenueByProduct.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Outstanding credit tabs, deliberately NOT scoped to `range`/`since` - a
  // tab opened last week is still owed today, and hiding it just because
  // the dashboard happens to be showing "Today" would understate what's
  // actually owed. Queried separately from the range-filtered `orders`
  // above for that reason.
  const unpaidCreditWhere: Where = {
    tenant: { equals: tenantId },
    status: { equals: 'completed' },
    tenderType: { equals: 'credit' },
    paymentStatus: { equals: 'pending' },
  };
  if (storeId) unpaidCreditWhere.store = { equals: storeId };
  const unpaidCredit = await payload.find({
    collection: 'orders',
    where: unpaidCreditWhere,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });

  // "Unpaid" now means "has a balance", not "has never had a payment
  // recorded against it" - a tab someone's chipped away at via installments
  // still shows its true remaining balance here, not its original total.
  const unpaidOrderIds = unpaidCredit.docs.map((order) => String(order.id));
  const amountPaidByOrder = new Map<string, number>();
  if (unpaidOrderIds.length > 0) {
    const payments = await payload.find({
      collection: 'credit-payments',
      where: { order: { in: unpaidOrderIds } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });
    for (const payment of payments.docs) {
      const orderId = String(payment.order);
      amountPaidByOrder.set(orderId, (amountPaidByOrder.get(orderId) ?? 0) + ((payment.amount as number) ?? 0));
    }
  }
  const unpaidCreditTotal = unpaidCredit.docs.reduce((sum, order) => {
    const total = (order.total as number) ?? 0;
    const paid = amountPaidByOrder.get(String(order.id)) ?? 0;
    return sum + Math.max(0, total - paid);
  }, 0);

  return Response.json({
    totalSales,
    totalTax,
    orderCount,
    profitTotal: canSeeProfit ? profitTotal : null,
    paymentBreakdown: totalsByTender,
    topProducts,
    byStore: Array.from(revenueByStore.entries()).map(([store, revenue]) => ({ store: Number(store), revenue })),
    unpaidCreditCount: unpaidCredit.docs.length,
    unpaidCreditTotal,
  });
}

function rangeStart(range: string): string | null {
  const now = new Date();
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (range === '7d') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === '30d') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}
