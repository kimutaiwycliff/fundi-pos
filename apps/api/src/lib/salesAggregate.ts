import type { Payload, Where } from 'payload';
import { toID } from './relations.ts';

// East Africa Time is a fixed UTC+3 offset year-round (no DST) - this is
// deliberately the SAME timezone apps/web/src/lib/format-date.ts pins every
// displayed timestamp to, for the same reason: a server process's own local
// time (UTC in Docker/production) doesn't necessarily match Kenya's actual
// wall-clock day, and "which calendar day/hour did this order happen in"
// needs to answer that question the way a person in Nairobi would, not the
// way the server's OS clock happens to be configured.
const NAIROBI_TZ = 'Africa/Nairobi';
const NAIROBI_OFFSET_HOURS = 3;

function nairobiParts(date: Date): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NAIROBI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24 };
}

// The reverse of nairobiParts: the UTC instant of 00:00 Nairobi time on a
// given Nairobi calendar date. JS's Date.UTC normalizes out-of-range
// components itself, so passing a negative hour correctly rolls back to the
// previous UTC day rather than needing manual arithmetic.
export function nairobiDateToUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, -NAIROBI_OFFSET_HOURS, 0, 0));
}

export function nairobiDateKey(date: Date): string {
  const { year, month, day } = nairobiParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function nairobiHour(date: Date): number {
  return nairobiParts(date).hour;
}

// Parses a "YYYY-MM-DD" query param (a Nairobi calendar date, per the above)
// into the [since, until) UTC instant window that date covers. Returns null
// for anything that doesn't parse as a clean date, so callers can fall back
// to their own default range rather than querying with `Invalid Date`.
export function parseDateParam(value: string | null): { since: Date; until: Date; key: string } | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const since = nairobiDateToUTC(year, month, day);
  const until = new Date(since.getTime() + 24 * 60 * 60 * 1000);
  return { since, until, key: value };
}

interface RawOrder {
  id: string;
  total: number;
  taxTotal: number;
  discountTotal: number;
  status: 'completed' | 'refunded' | 'voided';
  tenderType: 'cash' | 'mpesa' | 'card' | 'credit' | undefined;
  store: unknown;
  cashier: unknown;
  createdAt: string;
  lineItems: Array<{
    product: { id: number; name: string; category?: string | null; costPrice?: number } | number;
    quantity: number;
    unitPrice: number;
    discount: number;
  }>;
}

export interface SalesAggregate {
  totalSales: number;
  totalTax: number;
  discountGivenTotal: number;
  orderCount: number;
  averageOrderValue: number;
  profitTotal: number | null;
  paymentBreakdown: { cash: number; mpesa: number; card: number; credit: number };
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
  byStore: Array<{ store: number; revenue: number; orderCount: number }>;
  byCategory: Array<{ category: string; revenue: number; quantity: number }>;
  byCashier: Array<{ cashier: number; name: string; revenue: number; orderCount: number }>;
  byHour: Array<{ hour: number; revenue: number; orderCount: number }>;
  voidedCount: number;
  voidedTotal: number;
  refundedCount: number;
  refundedTotal: number;
}

export async function fetchOrdersInWindow(
  payload: Payload,
  tenantId: string | number,
  storeId: string | null,
  since: Date | null,
  until: Date | null,
): Promise<RawOrder[]> {
  const where: Where = { tenant: { equals: tenantId } };
  if (storeId) where.store = { equals: storeId };
  if (since || until) {
    const createdAt: Record<string, string> = {};
    if (since) createdAt.greater_than_equal = since.toISOString();
    if (until) createdAt.less_than = until.toISOString();
    where.createdAt = createdAt;
  }
  const result = await payload.find({
    collection: 'orders',
    where,
    pagination: false,
    depth: 1, // populates lineItems.product, store, cashier as full docs
    overrideAccess: true,
  });
  return result.docs as unknown as RawOrder[];
}

// Every distinct number the Reports page shows is computed in this one pass
// over the order set - completed orders drive the "how's business going"
// numbers, voided/refunded orders are tallied separately (a reversed sale
// never happened financially, but seeing HOW OFTEN it happens is its own
// loss-prevention signal owners want visible, not silently dropped).
export function aggregateOrders(orders: RawOrder[], canSeeProfit: boolean, canSeeStaff: boolean): SalesAggregate {
  let totalSales = 0;
  let totalTax = 0;
  let discountGivenTotal = 0;
  let profitTotal = 0;
  let orderCount = 0;
  let voidedCount = 0;
  let voidedTotal = 0;
  let refundedCount = 0;
  let refundedTotal = 0;
  const paymentBreakdown = { cash: 0, mpesa: 0, card: 0, credit: 0 };
  const revenueByProduct = new Map<string, { name: string; revenue: number; quantity: number }>();
  const revenueByStore = new Map<string, { revenue: number; orderCount: number }>();
  const revenueByCategory = new Map<string, { revenue: number; quantity: number }>();
  const revenueByCashier = new Map<string, { name: string; revenue: number; orderCount: number }>();
  const revenueByHour = new Map<number, { revenue: number; orderCount: number }>();
  for (let h = 0; h < 24; h++) revenueByHour.set(h, { revenue: 0, orderCount: 0 });

  for (const order of orders) {
    if (order.status === 'voided') {
      voidedCount++;
      voidedTotal += order.total ?? 0;
      continue;
    }
    if (order.status === 'refunded') {
      refundedCount++;
      refundedTotal += order.total ?? 0;
      continue;
    }

    const orderTotal = order.total ?? 0;
    orderCount++;
    totalSales += orderTotal;
    totalTax += order.taxTotal ?? 0;
    discountGivenTotal += order.discountTotal ?? 0;

    const storeKey = String(toID(order.store));
    const storeEntry = revenueByStore.get(storeKey) ?? { revenue: 0, orderCount: 0 };
    storeEntry.revenue += orderTotal;
    storeEntry.orderCount += 1;
    revenueByStore.set(storeKey, storeEntry);

    if (order.tenderType && order.tenderType in paymentBreakdown) {
      paymentBreakdown[order.tenderType] += orderTotal;
    }

    if (canSeeStaff) {
      const cashierKey = String(toID(order.cashier));
      const cashierName = typeof order.cashier === 'object' && order.cashier
        ? ((order.cashier as { name?: string; email?: string }).name ?? (order.cashier as { email?: string }).email ?? cashierKey)
        : cashierKey;
      const cashierEntry = revenueByCashier.get(cashierKey) ?? { name: cashierName, revenue: 0, orderCount: 0 };
      cashierEntry.revenue += orderTotal;
      cashierEntry.orderCount += 1;
      revenueByCashier.set(cashierKey, cashierEntry);
    }

    const hour = nairobiHour(new Date(order.createdAt));
    const hourEntry = revenueByHour.get(hour)!;
    hourEntry.revenue += orderTotal;
    hourEntry.orderCount += 1;

    for (const line of order.lineItems ?? []) {
      const productId = String(toID(line.product));
      const name = typeof line.product === 'object' ? line.product.name : `#${line.product}`;
      const category = (typeof line.product === 'object' ? line.product.category : null) || 'Uncategorized';
      const revenue = line.quantity * line.unitPrice - line.discount;

      const productEntry = revenueByProduct.get(productId) ?? { name, revenue: 0, quantity: 0 };
      productEntry.revenue += revenue;
      productEntry.quantity += line.quantity;
      revenueByProduct.set(productId, productEntry);

      const categoryEntry = revenueByCategory.get(category) ?? { revenue: 0, quantity: 0 };
      categoryEntry.revenue += revenue;
      categoryEntry.quantity += line.quantity;
      revenueByCategory.set(category, categoryEntry);

      if (canSeeProfit && typeof line.product === 'object' && typeof line.product.costPrice === 'number') {
        profitTotal += revenue - line.product.costPrice * line.quantity;
      }
    }
  }

  return {
    totalSales,
    totalTax,
    discountGivenTotal,
    orderCount,
    averageOrderValue: orderCount > 0 ? totalSales / orderCount : 0,
    profitTotal: canSeeProfit ? profitTotal : null,
    paymentBreakdown,
    topProducts: Array.from(revenueByProduct.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    byStore: Array.from(revenueByStore.entries())
      .map(([store, v]) => ({ store: Number(store), ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    byCategory: Array.from(revenueByCategory.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    byCashier: Array.from(revenueByCashier.entries())
      .map(([cashier, v]) => ({ cashier: Number(cashier), ...v }))
      .sort((a, b) => b.revenue - a.revenue),
    byHour: Array.from(revenueByHour.entries())
      .map(([hour, v]) => ({ hour, ...v }))
      .sort((a, b) => a.hour - b.hour),
    voidedCount,
    voidedTotal,
    refundedCount,
    refundedTotal,
  };
}
