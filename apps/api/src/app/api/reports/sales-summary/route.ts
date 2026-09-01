import config from '@payload-config';
import { getPayload, type Where } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { isTenantUser, toID } from '@/lib/relations';
import { aggregateOrders, fetchOrdersInWindow, parseDateParam } from '@/lib/salesAggregate';

export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const storeId = url.searchParams.get('store');
  const dateParam = parseDateParam(url.searchParams.get('date'));
  const range = url.searchParams.get('range') ?? 'all'; // today | 7d | 30d | all
  const tenantId = toID(user.tenant);
  const canSeeProfit = user.role === 'owner';
  // Cashier-by-cashier revenue is a staff-performance view, not just a
  // margin one - visible to whoever oversees staff (owner + manager), not
  // to a cashier looking at their own numbers.
  const canSeeStaff = user.role === 'owner' || user.role === 'manager';

  // A specific day (from the trend chart / date picker) always wins over
  // the rolling range - the two params are mutually exclusive from the
  // UI's own point of view, but resolving `date` first here means a stray
  // `range` left in the URL from a previous view can't silently override it.
  const { since, until } = dateParam ?? { since: rangeStart(range), until: null };

  const orders = await fetchOrdersInWindow(payload, tenantId, storeId, since, until);
  const summary = aggregateOrders(orders, canSeeProfit, canSeeStaff);

  // Previous-equivalent-period comparison - "up 12% vs last week" is far
  // more actionable than a bare number with no reference point. Skipped for
  // "all time" (no sensible "previous all time" window) and computed as
  // "the day before" when a specific date is selected.
  let comparison: { totalSales: number; orderCount: number; profitTotal: number | null } | null = null;
  const comparisonWindow = dateParam
    ? { since: new Date(dateParam.since.getTime() - 24 * 60 * 60 * 1000), until: dateParam.since }
    : previousRangeWindow(range);
  if (comparisonWindow) {
    const previousOrders = await fetchOrdersInWindow(payload, tenantId, storeId, comparisonWindow.since, comparisonWindow.until);
    const previous = aggregateOrders(previousOrders, canSeeProfit, false);
    comparison = { totalSales: previous.totalSales, orderCount: previous.orderCount, profitTotal: previous.profitTotal };
  }

  // Outstanding credit tabs, deliberately NOT scoped to the selected
  // range/date - a tab opened last week is still owed today, and hiding it
  // just because the dashboard happens to be showing "Today" (or some other
  // day) would understate what's actually owed. Queried separately from the
  // window-filtered `orders` above for that reason.
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
    ...summary,
    comparison,
    unpaidCreditCount: unpaidCredit.docs.length,
    unpaidCreditTotal,
  });
}

function rangeStart(range: string): Date | null {
  const now = new Date();
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (range === '7d') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (range === '30d') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return null;
}

// The same span of time, immediately before the current one - "today" vs
// "yesterday", "these 7 days" vs "the 7 days before that". Returns null for
// "all time", which has no meaningful predecessor to compare against.
function previousRangeWindow(range: string): { since: Date; until: Date } | null {
  const now = new Date();
  if (range === 'today') {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { since: new Date(todayStart.getTime() - 24 * 60 * 60 * 1000), until: todayStart };
  }
  if (range === '7d') {
    const currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { since: new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000), until: currentStart };
  }
  if (range === '30d') {
    const currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { since: new Date(currentStart.getTime() - 30 * 24 * 60 * 60 * 1000), until: currentStart };
  }
  return null;
}
