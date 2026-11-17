import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayload, type Payload } from 'payload';
import config from '../payload.config.ts';
import { flushActivity, recordActivity } from '../lib/activity.ts';

let authHeader: string | null = null;
vi.mock('next/headers', () => ({
  headers: async () => new Headers(authHeader ? { Authorization: authHeader } : {}),
}));

let payload: Payload;

async function truncateAll() {
  await flushActivity();
  const tables = [
    'tenant_activity_days', 'platform_tenant_notes', 'subscription_payments', 'orders_line_items', 'orders',
    'stock_movements', 'products_variants', 'products', 'customers', 'audit_log', 'users_sessions', 'users', 'stores',
    'platform_audit_log', 'platform_admins_sessions', 'platform_admins', 'tenants_addons', 'tenants',
  ];
  await payload.db.drizzle.execute(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`);
}

beforeAll(async () => {
  payload = await getPayload({ config });
});
afterAll(async () => {
  await payload.destroy();
});

describe('Platform insights: activity, health, tenant detail, follow-up notes', () => {
  let tenantId: number;
  let storeId: number;
  let cashierId: number;
  let productId: number;
  let cashier: any;
  let admin: any;

  beforeEach(async () => {
    await truncateAll();
    authHeader = null;
    const tenant = await payload.create({
      collection: 'tenants',
      data: { name: 'Kitengela Hardware', status: 'active', subscriptionTier: 'starter', billingStatus: 'active' },
      overrideAccess: true,
    });
    tenantId = tenant.id as number;
    storeId = (await payload.create({ collection: 'stores', data: { tenant: tenantId, name: 'Main', timezone: 'Africa/Nairobi' }, overrideAccess: true })).id as number;
    await payload.create({
      collection: 'users',
      data: { tenant: tenantId, role: 'owner', status: 'active', email: 'owner@test.local', password: 'pw123456', name: 'Njeri' },
      overrideAccess: true,
    });
    cashierId = (
      await payload.create({
        collection: 'users',
        data: { tenant: tenantId, store: storeId, role: 'cashier', status: 'active', email: 'cashier@test.local', password: 'pw123456', name: 'Kip' },
        overrideAccess: true,
      })
    ).id as number;
    cashier = { id: cashierId, tenant: { id: tenantId }, role: 'cashier', collection: 'users' };
    productId = (
      await payload.create({
        collection: 'products',
        data: { tenant: tenantId, sku: 'CEM50', name: 'Cement 50kg', costPrice: 650, sellPrice: 800, taxRate: 0, reorderPoint: 0, maxDiscountAmount: 0 },
        overrideAccess: true,
        draft: false,
      })
    ).id as number;
    await payload.create({
      collection: 'stock-movements',
      data: {
        id: crypto.randomUUID(), tenant: tenantId, store: storeId, product: productId,
        quantityDelta: 40, reason: 'restock', clientTimestamp: new Date().toISOString(), sourceTerminal: 'seed',
      },
      overrideAccess: true,
    });
    const adminDoc = await payload.create({
      collection: 'platform-admins',
      data: { name: 'Ops', email: 'ops@test.local', password: 'pw123456' } as any,
      overrideAccess: true,
    });
    admin = { ...adminDoc, collection: 'platform-admins' };
  });

  const sell = (quantity = 2) =>
    payload.create({
      collection: 'orders',
      data: {
        id: crypto.randomUUID(), tenant: tenantId, store: storeId, terminal: 'till-1', terminalName: 'Front counter', cashier: cashierId,
        lineItems: [{ product: productId, quantity, unitPrice: 800, discount: 0 }],
        taxTotal: 0, discountTotal: 0, total: 0,
        tenderType: 'mpesa', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
      } as any,
      user: cashier,
      overrideAccess: false,
      draft: false,
    });

  async function asAdmin() {
    const { token } = await payload.login({ collection: 'platform-admins', data: { email: 'ops@test.local', password: 'pw123456' } });
    authHeader = `JWT ${token}`;
  }

  async function activityRows() {
    await flushActivity();
    const r = await payload.db.drizzle.execute(`SELECT user_id, logins, pings, sources FROM tenant_activity_days ORDER BY user_id`);
    return r.rows as any[];
  }

  it('records a sign-in as activity for that day', async () => {
    await payload.login({ collection: 'users', data: { email: 'owner@test.local', password: 'pw123456' } });
    await payload.login({ collection: 'users', data: { email: 'owner@test.local', password: 'pw123456' } });
    const rows = await activityRows();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].logins)).toBe(2);
    expect(rows[0].sources).toEqual(['web']);
  });

  it('records a synced sale as a ping, throttled to one per five minutes', async () => {
    await sell();
    await sell();
    const rows = await activityRows();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].user_id)).toBe(cashierId);
    expect(Number(rows[0].pings)).toBe(1);
  });

  it('scores health, setup stage, stock and profit in platform-stats', async () => {
    await sell(2);
    await flushActivity();
    await asAdmin();
    const { GET } = await import('../app/api/platform-stats/route.ts');
    const body = await (await GET(new Request('http://test/api/platform-stats?fresh'))).json();
    const row = body.tenants.find((t: any) => t.id === tenantId);
    expect(row.setupStage).toBe('selling');
    expect(row.health.level).toBe('healthy');
    expect(row.activity.active7).toBe(true);
    expect(row.sales.revenue30).toBe(1600);
    // (800 - 650) x 2
    expect(row.sales.profit30).toBe(300);
    // 38 left x cost 650
    expect(row.sales.stockCost).toBe(38 * 650);
    expect(row.sales.spark30).toHaveLength(30);
    expect(row.sales.spark30[29]).toBe(1600);
    expect(body.summary.health.healthy).toBe(1);
    expect(body.summary.setupFunnel.selling).toBe(1);
    expect(body.daily).toHaveLength(30);
  });

  it('serves one tenant in depth to platform admins only', async () => {
    await sell(3);
    const { GET } = await import('../app/api/tenants/[id]/insights/route.ts');
    const ctx = { params: Promise.resolve({ id: String(tenantId) }) };
    expect((await GET(new Request('http://test'), ctx)).status).toBe(401);

    await asAdmin();
    const body = await (await GET(new Request('http://test'), ctx)).json();
    expect(body.daily).toHaveLength(90);
    expect(body.topProducts[0]).toMatchObject({ name: 'Cement 50kg', qty: 3, revenue: 2400, profit: 450 });
    expect(body.paymentMix[0]).toMatchObject({ method: 'mpesa', count: 1 });
    expect(body.staff.find((s: any) => s.id === cashierId)).toMatchObject({ sales30: 1 });
    expect(body.terminals[0]).toMatchObject({ terminal: 'till-1', name: 'Front counter', store: 'Main', sales30: 1 });
    expect(body.features).toMatchObject({ stores: 1, mpesaSales30: 1, products: 1, costedProducts: 1 });
    expect(body.milestones.firstSale).not.toBeNull();
    expect(body.lifetime).toMatchObject({ orders: 1, revenue: 2400 });
  });

  it('keeps follow-up notes platform-only and surfaces due follow-ups', async () => {
    const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    const note = await payload.create({
      collection: 'platform-tenant-notes',
      data: { tenant: tenantId, kind: 'call', body: 'Promised to pay Friday', followUpOn: today } as any,
      user: admin,
      overrideAccess: false,
    });
    expect(Number((note.author as any)?.id ?? note.author)).toBe(admin.id);
    await expect(
      payload.find({ collection: 'platform-tenant-notes', user: cashier, overrideAccess: false }),
    ).rejects.toThrow();

    await asAdmin();
    const { GET } = await import('../app/api/platform-stats/route.ts');
    const body = await (await GET(new Request('http://test/api/platform-stats?fresh'))).json();
    const row = body.tenants.find((t: any) => t.id === tenantId);
    expect(row).toMatchObject({ followUpOn: today, followUpDue: true });
    expect(body.summary.followUpsDue).toBe(1);
  });

  it('still deletes a user and purges a tenant that have activity and notes', async () => {
    const extra = await payload.create({
      collection: 'users',
      data: { tenant: tenantId, store: storeId, role: 'cashier', status: 'active', email: 'temp@test.local', password: 'pw123456' },
      overrideAccess: true,
    });
    recordActivity(payload, { userId: extra.id, tenantId, source: 'mobile', login: true });
    await flushActivity();
    await payload.delete({ collection: 'users', id: extra.id, overrideAccess: true });

    await payload.login({ collection: 'users', data: { email: 'owner@test.local', password: 'pw123456' } });
    await payload.create({ collection: 'platform-tenant-notes', data: { tenant: tenantId, body: 'note' } as any, user: admin, overrideAccess: false });
    await payload.update({ collection: 'tenants', id: tenantId, data: { status: 'deleted' }, overrideAccess: true });
    await asAdmin();
    const { POST } = await import('../app/api/tenants/[id]/purge/route.ts');
    const res = await POST(new Request('http://test', { method: 'POST' }), { params: Promise.resolve({ id: String(tenantId) }) });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(await activityRows()).toHaveLength(0);
  });
});
