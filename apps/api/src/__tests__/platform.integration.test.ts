import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayload, type Payload } from 'payload';
import config from '../payload.config.ts';

let authHeader: string | null = null;
vi.mock('next/headers', () => ({
  headers: async () => new Headers(authHeader ? { Authorization: authHeader } : {}),
}));

let payload: Payload;

async function truncateAll() {
  const tables = [
    'subscription_payments', 'orders_line_items', 'orders', 'stock_movements', 'products', 'customers',
    'users_sessions', 'users', 'stores', 'platform_audit_log', 'platform_admins_sessions', 'platform_admins',
    'tenants_addons', 'tenants_delivery_zones', 'tenants',
  ];
  await payload.db.drizzle.execute(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`);
}

const DAY = 24 * 60 * 60 * 1000;

describe('Platform billing: subscription payments + stats', () => {
  let tenantId: number;
  let admin: any;
  let owner: any;

  beforeAll(async () => {
    payload = await getPayload({ config });
  });
  afterAll(async () => {
    await payload.destroy();
  });

  beforeEach(async () => {
    await truncateAll();
    authHeader = null;
    const tenant = await payload.create({
      collection: 'tenants',
      data: { name: 'Luxe Collections', status: 'active', subscriptionTier: 'starter', billingStatus: 'past_due' },
      overrideAccess: true,
    });
    tenantId = tenant.id as number;
    const adminDoc = await payload.create({
      collection: 'platform-admins',
      data: { name: 'Ops', email: 'ops@test.local', password: 'pw123456' } as any,
      overrideAccess: true,
    });
    admin = { ...adminDoc, collection: 'platform-admins' };
    const ownerDoc = await payload.create({
      collection: 'users',
      data: { tenant: tenantId, role: 'owner', status: 'active', email: 'owner@test.local', password: 'pw123456', name: 'Wanjiku' },
      overrideAccess: true,
    });
    owner = { ...ownerDoc, tenant: { id: tenantId }, collection: 'users' };
  });

  function pay(data: Record<string, unknown> = {}) {
    return payload.create({
      collection: 'subscription-payments',
      data: { tenant: tenantId, amount: 1000, method: 'mpesa', reference: 'QJK7TEST', ...data } as any,
      user: admin,
      overrideAccess: false,
    });
  }

  it('starts every new tenant on a 14-day trial clock', async () => {
    const t = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true });
    const days = (new Date(t.trialEndsAt as string).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
  });

  it('extends paidUntil one cycle per payment, continuing from the current date, and reactivates past_due', async () => {
    const first = await pay();
    let t = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true });
    expect(t.paidUntil).toBe(first.periodEnd);
    expect(t.billingStatus).toBe('active');
    const firstEnd = new Date(first.periodEnd as string);
    expect((firstEnd.getTime() - Date.now()) / DAY).toBeGreaterThan(27);

    const second = await pay({ reference: 'QJK7TEST2' });
    expect(second.periodStart).toBe(first.periodEnd); // paying early loses nothing
    t = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true });
    expect(t.paidUntil).toBe(second.periodEnd);

    // Deleting a mistaken payment rolls paidUntil back.
    await payload.delete({ collection: 'subscription-payments', id: second.id, user: admin, overrideAccess: false });
    t = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true });
    expect(t.paidUntil).toBe(first.periodEnd);

    const log = await payload.find({ collection: 'platform-audit-log', where: { tenant: { equals: tenantId } }, sort: 'createdAt', overrideAccess: true });
    expect(log.docs.map((d) => d.action)).toEqual(['payment_recorded', 'payment_recorded', 'payment_deleted']);
    expect(log.docs[0].summary).toContain('KES 1,000');
  });

  it('keeps payments and platform notes away from tenants', async () => {
    await pay();
    await payload.update({ collection: 'tenants', id: tenantId, data: { platformNotes: 'Pays late, call on the 5th' }, user: admin, overrideAccess: false });
    // Billing edits are audit-logged by field name - never the notes' text.
    const billingLog = await payload.find({ collection: 'platform-audit-log', where: { action: { equals: 'billing_updated' } }, overrideAccess: true });
    expect(billingLog.docs[0]?.summary).toBe('Luxe Collections: updated internal notes');
    expect(JSON.stringify(billingLog.docs[0]?.metadata)).not.toContain('Pays late');
    await expect(payload.find({ collection: 'subscription-payments', user: owner, overrideAccess: false })).rejects.toThrow();
    const seen = await payload.findByID({ collection: 'tenants', id: tenantId, user: owner, overrideAccess: false });
    expect(seen.platformNotes).toBeUndefined();
    // Owners can't change their own price or paid-until.
    await payload.update({ collection: 'tenants', id: tenantId, data: { planPrice: 1, paidUntil: '2030-01-01T00:00:00Z' } as any, user: owner, overrideAccess: false });
    const after = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true });
    expect(after.planPrice ?? null).toBeNull();
    expect(new Date(after.paidUntil as string).getFullYear()).toBeLessThan(2030);
  });

  it('serves portfolio stats to platform admins only', async () => {
    const { GET } = await import('../app/api/platform-stats/route.ts');
    // Tenant session -> refused.
    const ownerLogin = await payload.login({ collection: 'users', data: { email: 'owner@test.local', password: 'pw123456' } });
    authHeader = `JWT ${ownerLogin.token}`;
    expect((await GET()).status).toBe(401);

    await pay({ amount: 1500 });
    await payload.create({
      collection: 'tenants',
      data: { name: 'Overdue Hardware', status: 'active', subscriptionTier: 'growth', billingStatus: 'active', paidUntil: new Date(Date.now() - 3 * DAY).toISOString() },
      overrideAccess: true,
    });

    const adminLogin = await payload.login({ collection: 'platform-admins', data: { email: 'ops@test.local', password: 'pw123456' } });
    authHeader = `JWT ${adminLogin.token}`;
    const body = await (await GET()).json();
    expect(body.summary.tenants).toBe(2);
    expect(body.summary.overdue).toBe(1);
    expect(body.summary.payingTenants).toBe(1);
    expect(body.summary.mrr).toBe(1000); // starter list price, monthly
    expect(body.summary.collectedThisMonth).toBe(1500);
    const luxe = body.tenants.find((t: { name: string }) => t.name === 'Luxe Collections');
    expect(luxe).toMatchObject({ state: 'paid', owner: { email: 'owner@test.local', name: 'Wanjiku' }, payments: { total: 1500, count: 1 } });
    const overdue = body.tenants.find((t: { name: string }) => t.name === 'Overdue Hardware');
    expect(overdue).toMatchObject({ state: 'overdue', needsAttention: true });
    expect(body.collectionsByMonth).toHaveLength(12);
    expect(body.recentPayments[0]).toMatchObject({ tenantName: 'Luxe Collections', amount: 1500 });
  });
});
