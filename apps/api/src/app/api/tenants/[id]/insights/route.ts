import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { computeHealth, daysUntil, setupStage, subscriptionState, tenantAccess } from '@hardware-pos/business-logic';
import { emptyRollup, tenantDetail, tenantRollups } from '@/lib/platformInsights';

// PLATFORM-ADMIN ONLY. One tenant in depth for the /platform tenant page's
// Overview / Usage / Team tabs: the same rollup and health score the
// tenants list shows, plus 90 days of daily sales and profit, busy hours,
// payment mix, top products, per-store numbers, staff activity, tills and
// which features they actually use.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (user?.collection !== 'platform-admins') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = Number((await params).id);
  const tenant = Number.isFinite(id)
    ? await payload.findByID({ collection: 'tenants', id, depth: 0, overrideAccess: true }).catch(() => null)
    : null;
  if (!tenant) return Response.json({ error: 'Tenant not found' }, { status: 404 });

  const now = new Date();
  const [rollups, detail] = await Promise.all([tenantRollups(payload, now, id), tenantDetail(payload, id, now)]);
  const roll = rollups.get(id) ?? emptyRollup();
  const state = subscriptionState(tenant as never, now);
  const access = tenantAccess(tenant as never, now);
  const health = computeHealth({
    now,
    createdAt: tenant.createdAt as string,
    lastActiveAt: roll.lastActiveAt,
    firstSaleAt: roll.firstSaleAt,
    revenue30: roll.revenue30,
    revenuePrev30: roll.revenuePrev30,
    activeStaff30: roll.activeStaff30,
    staffCount: roll.staff,
    state,
    daysLeft: access.lockAt ? daysUntil(access.lockAt.toISOString(), now) : null,
  });

  return Response.json({
    generatedAt: now.toISOString(),
    health,
    setupStage: setupStage({ products: roll.products, pricedProducts: roll.pricedProducts, stockedProducts: roll.stockedProducts, firstSaleAt: roll.firstSaleAt }),
    rollup: roll,
    ...detail,
  });
}
