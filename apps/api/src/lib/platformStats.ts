// Everything the /platform console's overview and tenants list show, in
// one pass over every tenant. Used by GET /api/platform-stats and the
// weekly operator digest.
import type { Payload } from 'payload';
import { sql } from 'drizzle-orm';
import {
  ADDONS,
  cyclePrice,
  daysUntil,
  monthlyValue,
  computeHealth,
  HEALTH_LEVELS,
  isAttentionHealth,
  needsAttention,
  SETUP_STAGES,
  setupStage,
  subscriptionState,
  tenantAccess,
  type SubscriptionState,
} from '@hardware-pos/business-logic';
import { emptyRollup, nairobiDay, platformDaily, tenantRollups } from './platformInsights.ts';

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

export async function buildStats(payload: Payload) {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [tenants, owners, payments, stores, users, products, orders30, lastOrder, rollups, daily, pendingClaims, pendingTrials, repeatTrials] = await Promise.all([
    payload.find({ collection: 'tenants', where: { status: { not_equals: 'deleted' } }, pagination: false, depth: 0, overrideAccess: true }),
    payload.find({
      collection: 'users',
      where: { role: { equals: 'owner' } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { tenant: true, name: true, email: true, phone: true },
    }),
    payload.find({
      collection: 'subscription-payments',
      where: { status: { equals: 'confirmed' } },
      pagination: false,
      depth: 0,
      sort: '-paidAt',
      overrideAccess: true,
    }),
    payload.db.drizzle.execute<CountRow>(sql`SELECT tenant_id, COUNT(*)::int AS n FROM stores GROUP BY tenant_id`),
    payload.db.drizzle.execute<CountRow>(sql`SELECT tenant_id, COUNT(*)::int AS n FROM users GROUP BY tenant_id`),
    payload.db.drizzle.execute<CountRow>(sql`SELECT tenant_id, COUNT(*)::int AS n FROM products WHERE is_active GROUP BY tenant_id`),
    payload.db.drizzle.execute<OrderRow>(sql`
      SELECT tenant_id, COUNT(*)::int AS n, COALESCE(SUM(total), 0)::float8 AS gmv
      FROM orders WHERE status = 'completed' AND created_at >= ${since30}
      GROUP BY tenant_id`),
    payload.db.drizzle.execute<LastRow>(sql`SELECT tenant_id, MAX(created_at) AS last_at FROM orders GROUP BY tenant_id`),
    tenantRollups(payload, now),
    platformDaily(payload, now),
    payload.db.drizzle.execute<CountRow>(sql`SELECT tenant_id, COUNT(*)::int AS n FROM subscription_payments WHERE status = 'pending' GROUP BY tenant_id`),
    payload.db.drizzle.execute<CountRow>(sql`SELECT tenant_id, COUNT(*)::int AS n FROM trial_extension_requests WHERE status = 'pending' GROUP BY tenant_id`),
    // Earlier trials matching this tenant's own trial grant on email or phone.
    payload.db.drizzle.execute<CountRow>(sql`
      SELECT g.tenant_id, COUNT(DISTINCT p.id)::int AS n
      FROM trial_grants g
      JOIN trial_grants p ON p.id <> g.id AND p.created_at < g.created_at
        AND (p.tenant_id IS NULL OR p.tenant_id <> g.tenant_id)
        AND ((g.email_canonical IS NOT NULL AND p.email_canonical = g.email_canonical) OR (g.phone IS NOT NULL AND p.phone = g.phone)
          OR (g.google_sub IS NOT NULL AND p.google_sub = g.google_sub))
      WHERE g.tenant_id IS NOT NULL
      GROUP BY g.tenant_id`),
  ]);
  const repeatTrialCounts = new Map(repeatTrials.rows.map((r) => [Number(r.tenant_id), Number(r.n)]));
  const claimCounts = new Map(pendingClaims.rows.map((r) => [Number(r.tenant_id), Number(r.n)]));
  const trialRequestCounts = new Map(pendingTrials.rows.map((r) => [Number(r.tenant_id), Number(r.n)]));
  const today = nairobiDay(now);

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
    const roll = rollups.get(id) ?? emptyRollup();
    const access = tenantAccess(t as never, now);
    const health = computeHealth({
      now,
      createdAt: t.createdAt as string,
      lastActiveAt: roll.lastActiveAt,
      firstSaleAt: roll.firstSaleAt,
      revenue30: roll.revenue30,
      revenuePrev30: roll.revenuePrev30,
      activeStaff30: roll.activeStaff30,
      staffCount: roll.staff,
      state,
      daysLeft: access.lockAt ? daysUntil(access.lockAt.toISOString(), now) : null,
    });
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
      // A payment claim or trial request waiting on the operator needs action too.
      needsAttention: needsAttention(state) || (claimCounts.get(id) ?? 0) > 0 || (trialRequestCounts.get(id) ?? 0) > 0,
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
      // When automatic lockout kicks in (null = not on a lapsing clock).
      lockAt: access.lockAt?.toISOString() ?? null,
      blocked: !access.allowed,
      health,
      setupStage: setupStage({ products: roll.products, pricedProducts: roll.pricedProducts, stockedProducts: roll.stockedProducts, firstSaleAt: roll.firstSaleAt }),
      activity: {
        lastActiveAt: roll.lastActiveAt,
        lastLoginAt: roll.lastLoginAt,
        logins30: roll.logins30,
        activeDays30: roll.activeDays30,
        activeStaff30: roll.activeStaff30,
        staff: roll.staff,
        active7: roll.active7,
      },
      sales: {
        firstSaleAt: roll.firstSaleAt,
        revenue30: roll.revenue30,
        revenuePrev30: roll.revenuePrev30,
        profit30: roll.profit30,
        stockCost: roll.stockCost,
        stockRetail: roll.stockRetail,
        spark30: roll.spark30,
      },
      repeatTrial: (repeatTrialCounts.get(id) ?? 0) > 0,
      marketingOptOut: Boolean(t.marketingOptOut),
      pendingClaims: claimCounts.get(id) ?? 0,
      pendingTrialRequests: trialRequestCounts.get(id) ?? 0,
      followUpOn: roll.followUpOn,
      followUpDue: roll.followUpOn != null && roll.followUpOn <= today,
      lastNoteAt: roll.lastNoteAt,
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

  return {
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
      active7: rows.filter((r) => r.activity.active7).length,
      revenue30: rows.reduce((sum, r) => sum + r.sales.revenue30, 0),
      profit30: rows.reduce((sum, r) => sum + r.sales.profit30, 0),
      health: Object.fromEntries(HEALTH_LEVELS.map((h) => [h, rows.filter((r) => r.health.level === h).length])),
      atRisk: rows.filter((r) => isAttentionHealth(r.health.level)).length,
      setupFunnel: Object.fromEntries(SETUP_STAGES.map((st) => [st, rows.filter((r) => r.setupStage === st).length])),
      followUpsDue: rows.filter((r) => r.followUpDue).length,
      blocked: rows.filter((r) => r.blocked).length,
      pendingClaims: rows.reduce((sum, r) => sum + r.pendingClaims, 0),
      pendingTrialRequests: rows.reduce((sum, r) => sum + r.pendingTrialRequests, 0),
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
    daily,
    tenants: rows,
  };
}

export type PlatformStats = Awaited<ReturnType<typeof buildStats>>;
