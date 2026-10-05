import config from '@payload-config';
import { getPayload } from 'payload';
import { sql } from 'drizzle-orm';
import { headers as nextHeaders } from 'next/headers';
import {
  ADDONS,
  cyclePrice,
  daysUntil,
  monthlyValue,
  needsAttention,
  subscriptionState,
  type SubscriptionState,
} from '@hardware-pos/business-logic';

interface CountRow extends Record<string, unknown> {
  tenant_id: number;
  n: number;
}
interface OrderRow extends Record<string, unknown> {
  tenant_id: number;
  n: number;
  gmv: number;
}
interface LastRow extends Record<string, unknown> {
  tenant_id: number;
  last_at: string | null;
}

function monthKey(date: Date): string {
  // Nairobi month (UTC+3, no DST) - matches how the business thinks of "this month".
  const nairobi = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return `${nairobi.getUTCFullYear()}-${String(nairobi.getUTCMonth() + 1).padStart(2, '0')}`;
}

// PLATFORM-ADMIN ONLY. Everything the /platform console needs in one call:
// portfolio KPIs (MRR, overdue, trials ending...), collections by month and
// a per-tenant row with billing state, owner contact and 30-day usage. Read
// only; all heavy counting happens in SQL GROUP BYs, not per-tenant queries.
export async function GET() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (user?.collection !== 'platform-admins') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [tenants, owners, payments, stores, users, products, orders30, lastOrder] = await Promise.all([
    payload.find({ collection: 'tenants', where: { status: { not_equals: 'deleted' } }, pagination: false, depth: 0, overrideAccess: true }),
    payload.find({
      collection: 'users',
      where: { role: { equals: 'owner' } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { tenant: true, name: true, email: true, phone: true },
    }),
    payload.find({ collection: 'subscription-payments', pagination: false, depth: 0, sort: '-paidAt', overrideAccess: true }),
    payload.db.drizzle.execute<CountRow>(sql`SELECT tenant_id, COUNT(*)::int AS n FROM stores GROUP BY tenant_id`),
    payload.db.drizzle.execute<CountRow>(sql`SELECT tenant_id, COUNT(*)::int AS n FROM users GROUP BY tenant_id`),
    payload.db.drizzle.execute<CountRow>(sql`SELECT tenant_id, COUNT(*)::int AS n FROM products WHERE is_active GROUP BY tenant_id`),
    payload.db.drizzle.execute<OrderRow>(sql`
      SELECT tenant_id, COUNT(*)::int AS n, COALESCE(SUM(total), 0)::float8 AS gmv
      FROM orders WHERE status = 'completed' AND created_at >= ${since30}
      GROUP BY tenant_id`),
    payload.db.drizzle.execute<LastRow>(sql`SELECT tenant_id, MAX(created_at) AS last_at FROM orders GROUP BY tenant_id`),
  ]);

  const byTenant = <T extends { tenant_id: number }>(rows: T[]) => new Map(rows.map((r) => [Number(r.tenant_id), r]));
  const storeCounts = byTenant(stores.rows);
  const userCounts = byTenant(users.rows);
  const productCounts = byTenant(products.rows);
  const orderStats = byTenant(orders30.rows);
  const lastOrders = byTenant(lastOrder.rows);
  const ownerByTenant = new Map<number, { name: string | null; email: string | null; phone: string | null }>();
  for (const o of owners.docs) {
    const tid = Number(o.tenant);
    if (!ownerByTenant.has(tid)) ownerByTenant.set(tid, { name: (o.name as string) ?? null, email: (o.email as string) ?? null, phone: (o.phone as string) ?? null });
  }
  const paymentsByTenant = new Map<number, { total: number; last: string | null; count: number }>();
  for (const p of payments.docs) {
    const tid = Number(p.tenant);
    const entry = paymentsByTenant.get(tid) ?? { total: 0, last: null, count: 0 };
    entry.total += Number(p.amount ?? 0);
    entry.count += 1;
    if (!entry.last || (p.paidAt as string) > entry.last) entry.last = p.paidAt as string;
    paymentsByTenant.set(tid, entry);
  }

  const rows = tenants.docs.map((t) => {
    const id = Number(t.id);
    const state = subscriptionState(t as never, now);
    const order = orderStats.get(id);
    const paid = paymentsByTenant.get(id);
    return {
      id,
      name: t.name as string,
      status: t.status as string,
      subscriptionTier: t.subscriptionTier as string,
      billingStatus: t.billingStatus as string,
      billingCycle: (t.billingCycle as string | null) ?? 'monthly',
      planPrice: (t.planPrice as number | null) ?? null,
      cyclePrice: cyclePrice(t.planPrice as number | null, t.billingCycle as string | null, t.subscriptionTier as string),
      monthlyValue: monthlyValue(t.planPrice as number | null, t.billingCycle as string | null, t.subscriptionTier as string),
      paidUntil: (t.paidUntil as string | null) ?? null,
      trialEndsAt: (t.trialEndsAt as string | null) ?? null,
      daysUntilDue: daysUntil((t.paidUntil as string | null) ?? null, now),
      state,
      needsAttention: needsAttention(state),
      addons: (t.addons as string[] | null) ?? [],
      createdAt: t.createdAt as string,
      owner: ownerByTenant.get(id) ?? null,
      billingContact: {
        name: (t.billingContactName as string | null) ?? null,
        phone: (t.billingContactPhone as string | null) ?? null,
        email: (t.billingContactEmail as string | null) ?? null,
      },
      usage: {
        stores: storeCounts.get(id)?.n ?? 0,
        users: userCounts.get(id)?.n ?? 0,
        products: productCounts.get(id)?.n ?? 0,
        orders30d: order?.n ?? 0,
        gmv30d: order?.gmv ?? 0,
        lastOrderAt: lastOrders.get(id)?.last_at ? new Date(lastOrders.get(id)!.last_at as string).toISOString() : null,
      },
      payments: { total: paid?.total ?? 0, count: paid?.count ?? 0, lastPaidAt: paid?.last ?? null },
    };
  });

  // Recurring revenue only counts tenants who are actually paying right now.
  const payingStates: SubscriptionState[] = ['paid', 'due_soon'];
  const paying = rows.filter((r) => payingStates.includes(r.state));
  const mrr = paying.reduce((sum, r) => sum + r.monthlyValue, 0);

  const thisMonth = monthKey(now);
  const lastMonth = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)));
  const byMonth = new Map<string, number>();
  for (let i = 11; i >= 0; i--) byMonth.set(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15))), 0);
  for (const p of payments.docs) {
    const key = monthKey(new Date(p.paidAt as string));
    if (byMonth.has(key)) byMonth.set(key, (byMonth.get(key) ?? 0) + Number(p.amount ?? 0));
  }

  const countBy = (key: (r: (typeof rows)[number]) => string) =>
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[key(r)] = (acc[key(r)] ?? 0) + 1;
      return acc;
    }, {});
  const tenantName = new Map(rows.map((r) => [r.id, r.name]));

  return Response.json({
    generatedAt: now.toISOString(),
    summary: {
      tenants: rows.length,
      byStatus: countBy((r) => r.status),
      byTier: countBy((r) => r.subscriptionTier),
      byState: countBy((r) => r.state),
      payingTenants: paying.length,
      mrr,
      arr: mrr * 12,
      overdue: rows.filter((r) => r.state === 'overdue').length,
      dueSoon: rows.filter((r) => r.state === 'due_soon').length,
      trialsEnding: rows.filter((r) => r.state === 'trial_ending').length,
      needsAttention: rows.filter((r) => r.needsAttention).length,
      newThisMonth: rows.filter((r) => monthKey(new Date(r.createdAt)) === thisMonth).length,
      activeLast30d: rows.filter((r) => r.usage.orders30d > 0).length,
      collectedThisMonth: byMonth.get(thisMonth) ?? 0,
      collectedLastMonth: payments.docs
        .filter((p) => monthKey(new Date(p.paidAt as string)) === lastMonth)
        .reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
      addons: Object.fromEntries(ADDONS.map((a) => [a, rows.filter((r) => r.addons.includes(a)).length])),
    },
    collectionsByMonth: Array.from(byMonth.entries()).map(([month, amount]) => ({ month, amount })),
    recentPayments: payments.docs.slice(0, 15).map((p) => ({
      id: p.id,
      tenant: Number(p.tenant),
      tenantName: tenantName.get(Number(p.tenant)) ?? `#${p.tenant}`,
      amount: Number(p.amount ?? 0),
      method: p.method,
      reference: p.reference ?? null,
      paidAt: p.paidAt,
      periodEnd: p.periodEnd ?? null,
    })),
    tenants: rows,
  });
}
