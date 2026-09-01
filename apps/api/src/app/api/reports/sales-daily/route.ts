import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { isTenantUser, toID } from '@/lib/relations';
import { aggregateOrders, fetchOrdersInWindow, nairobiDateKey } from '@/lib/salesAggregate';

// Backs the Reports page's daily trend chart - one row per Nairobi calendar
// day in the requested range, each with just enough of the same numbers
// sales-summary computes (revenue/orders/voids/refunds) to plot a trend and
// decide which days need attention, without the full per-product/per-hour
// breakdown sales-summary?date=... returns when a specific day is opened.
export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const storeId = url.searchParams.get('store');
  const range = url.searchParams.get('range') ?? '30d'; // 7d | 30d
  const days = range === '7d' ? 7 : 30;
  const tenantId = toID(user.tenant);

  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const orders = await fetchOrdersInWindow(payload, tenantId, storeId, since, null);

  const byDay = new Map<string, typeof orders>();
  for (const order of orders) {
    const key = nairobiDateKey(new Date(order.createdAt));
    const bucket = byDay.get(key);
    if (bucket) bucket.push(order);
    else byDay.set(key, [order]);
  }

  // Every day in the window gets a row even with zero orders - a flat gap
  // in the trend is itself informative (a day the shop was closed, or a
  // dead Tuesday worth noticing), and a chart with missing x-axis points
  // for quiet days would misleadingly compress the timeline.
  const result: Array<{ date: string; totalSales: number; orderCount: number; voidedCount: number; refundedCount: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = nairobiDateKey(day);
    const dayOrders = byDay.get(key) ?? [];
    const agg = aggregateOrders(dayOrders, false, false);
    result.push({
      date: key,
      totalSales: agg.totalSales,
      orderCount: agg.orderCount,
      voidedCount: agg.voidedCount,
      refundedCount: agg.refundedCount,
    });
  }

  return Response.json({ days: result });
}
