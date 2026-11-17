import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayload, type Payload } from 'payload';
import config from '../payload.config.ts';
import { flushActivity } from '../lib/activity.ts';
import { flushBackground } from '../lib/background.ts';
import { sendEmail } from '../lib/email.ts';
import { runBillingReminders, runPlatformDigest } from '../lib/notifications.ts';

let authHeader: string | null = null;
vi.mock('next/headers', () => ({
  headers: async () => new Headers(authHeader ? { Authorization: authHeader } : {}),
}));

let payload: Payload;
const DAY = 24 * 60 * 60 * 1000;

async function truncateAll() {
  await flushActivity();
  await flushBackground();
  const tables = [
    'platform_notifications', 'trial_extension_requests', 'tenant_activity_days', 'platform_tenant_notes', 'subscription_payments',
    'audit_log', 'users_sessions', 'users', 'stores', 'platform_audit_log', 'platform_admins_sessions', 'platform_admins',
    'tenants_addons', 'tenants',
  ];
  await payload.db.drizzle.execute(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`);
}

beforeAll(async () => {
  payload = await getPayload({ config });
});
afterAll(async () => {
  await flushBackground();
  await payload.destroy();
});

describe('Tenant billing: claims, trial extensions, reminders, digest', () => {
  let tenantId: number;
  let admin: any;

  beforeEach(async () => {
    await truncateAll();
    authHeader = null;
    process.env.PLATFORM_NOTIFY_EMAIL = 'ops@fundi.test';
    process.env.PLATFORM_MPESA_PAYBILL = '400200';
    delete process.env.BREVO_API_KEY;
    tenantId = (
      await payload.create({
        collection: 'tenants',
        data: { name: 'Ruiru Hardware', status: 'active', subscriptionTier: 'trial', billingStatus: 'trialing' },
        overrideAccess: true,
      })
    ).id as number;
    await payload.create({
      collection: 'users',
      data: { tenant: tenantId, role: 'owner', status: 'active', email: 'owner@ruiru.test', password: 'pw123456', name: 'Wambui Kamau' },
      overrideAccess: true,
    });
    await payload.create({
      collection: 'users',
      data: { tenant: tenantId, role: 'cashier', status: 'active', email: 'cashier@ruiru.test', password: 'pw123456' },
      overrideAccess: true,
    });
    const adminDoc = await payload.create({
      collection: 'platform-admins',
      data: { name: 'Ops', email: 'ops@fundi.test', password: 'pw123456' } as any,
      overrideAccess: true,
    });
    admin = { ...adminDoc, collection: 'platform-admins' };
  });

  afterEach(() => vi.unstubAllGlobals());

  const setTrialEnd = (daysFromNow: number) =>
    payload.update({
      collection: 'tenants',
      id: tenantId,
      data: { trialEndsAt: new Date(Date.now() + daysFromNow * DAY).toISOString() },
      overrideAccess: true,
    });
  async function loginAs(email: string) {
    const { token } = await payload.login({ collection: 'users', data: { email, password: 'pw123456' } });
    authHeader = `JWT ${token}`;
  }
  async function claim(body: Record<string, unknown>) {
    const { POST } = await import('../app/api/billing/claim/route.ts');
    return POST(new Request('http://test', { method: 'POST', body: JSON.stringify(body) }));
  }
  async function notifications() {
    await flushBackground();
    const r = await payload.find({ collection: 'platform-notifications', sort: 'createdAt', pagination: false, overrideAccess: true });
    return r.docs;
  }

  it('turns an "I\'ve paid" claim into a pending payment that only counts once confirmed', async () => {
    await loginAs('owner@ruiru.test');
    const res = await claim({ amount: 1000, reference: 'qjk7abc123' });
    expect(res.status).toBe(201);
    const { id } = await res.json();

    let tenant = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true });
    expect(tenant.paidUntil).toBeFalsy();
    expect((await notifications()).map((n) => n.kind)).toEqual(['operator_payment_claim']);

    await payload.update({ collection: 'subscription-payments', id, data: { status: 'confirmed' }, user: admin, overrideAccess: false });
    const payment = await payload.findByID({ collection: 'subscription-payments', id, depth: 0, overrideAccess: true });
    expect(payment).toMatchObject({ status: 'confirmed', reference: 'QJK7ABC123', decidedBy: admin.id });
    expect(payment.periodEnd).toBeTruthy();
    tenant = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true });
    expect(tenant.paidUntil).toBe(payment.periodEnd);

    const sent = await notifications();
    expect(sent.map((n) => n.kind)).toEqual(['operator_payment_claim', 'owner_payment_confirmed']);
    expect(sent[1]).toMatchObject({ to: 'owner@ruiru.test', status: 'logged' });
    await expect(
      payload.update({ collection: 'subscription-payments', id, data: { status: 'rejected' }, user: admin, overrideAccess: false }),
    ).rejects.toThrow(/Only a pending/);
  });

  it('lets a locked-out owner still send a claim, and restores access on confirmation', async () => {
    await loginAs('owner@ruiru.test');
    await setTrialEnd(-10);
    await expect(payload.login({ collection: 'users', data: { email: 'owner@ruiru.test', password: 'pw123456' } })).rejects.toThrow();
    const res = await claim({ amount: 1000, reference: 'QJK7LOCKED' });
    expect(res.status).toBe(201);
    await payload.update({
      collection: 'subscription-payments',
      id: (await res.json()).id,
      data: { status: 'confirmed' },
      user: admin,
      overrideAccess: false,
    });
    await expect(payload.login({ collection: 'users', data: { email: 'owner@ruiru.test', password: 'pw123456' } })).resolves.toBeTruthy();
  });

  it('rejects a claim without touching paid-until, and refuses duplicates and cashiers', async () => {
    await loginAs('owner@ruiru.test');
    const res = await claim({ amount: 1000, reference: 'QJK7DUP001' });
    expect((await claim({ amount: 1000, reference: 'qjk7dup001' })).status).toBe(409);
    expect((await claim({ amount: 1000, reference: 'x' })).status).toBe(400);
    const { id } = await res.json();
    await payload.update({
      collection: 'subscription-payments',
      id,
      data: { status: 'rejected', rejectReason: 'No such code' },
      user: admin,
      overrideAccess: false,
    });
    expect((await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true })).paidUntil).toBeFalsy();
    expect((await notifications()).at(-1)).toMatchObject({ kind: 'owner_payment_rejected' });

    await loginAs('cashier@ruiru.test');
    expect((await claim({ amount: 1000, reference: 'QJK7CASH01' })).status).toBe(403);
  });

  it('shows the owner their billing, including pending claims and how to pay', async () => {
    await loginAs('owner@ruiru.test');
    await claim({ amount: 1000, reference: 'QJK7VIEW01' });
    const { GET } = await import('../app/api/billing/route.ts');
    const body = await (await GET()).json();
    expect(body).toMatchObject({ state: 'trial', allowed: true, payTo: { kind: 'paybill', number: '400200', account: `FUNDI${tenantId}` } });
    expect(body.payments[0]).toMatchObject({ reference: 'QJK7VIEW01', status: 'pending' });
  });

  it('extends a trial when the operator approves a request, which lifts a lockout', async () => {
    await loginAs('owner@ruiru.test'); // an existing session, then the trial lapses
    await setTrialEnd(-10);
    const { POST } = await import('../app/api/billing/trial-extension/route.ts');
    const res = await POST(new Request('http://test', { method: 'POST', body: JSON.stringify({ message: 'Still loading stock' }) }));
    expect(res.status).toBe(201);
    expect((await POST(new Request('http://test', { method: 'POST', body: '{}' }))).status).toBe(409);
    const { id } = await res.json();

    await expect(
      payload.update({ collection: 'trial-extension-requests', id, data: { status: 'approved' }, user: admin, overrideAccess: false }),
    ).rejects.toThrow(/how many days/);
    await payload.update({
      collection: 'trial-extension-requests',
      id,
      data: { status: 'approved', daysGranted: 7 },
      user: admin,
      overrideAccess: false,
    });
    const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true });
    const daysLeft = (new Date(tenant.trialEndsAt as string).getTime() - Date.now()) / DAY;
    expect(daysLeft).toBeGreaterThan(6.5);
    expect(daysLeft).toBeLessThan(8.1);
    await expect(payload.login({ collection: 'users', data: { email: 'owner@ruiru.test', password: 'pw123456' } })).resolves.toBeTruthy();
    expect((await notifications()).map((n) => n.kind)).toEqual(['operator_trial_request', 'owner_trial_extended']);
    await expect(
      payload.update({ collection: 'trial-extension-requests', id, data: { status: 'declined' }, user: admin, overrideAccess: false }),
    ).rejects.toThrow(/already been decided/);
  });

  it('sends each billing reminder once, and leaves long-lapsed shops alone', async () => {
    await setTrialEnd(2);
    expect(await runBillingReminders(payload)).toEqual({ owner_trial_ending: 1 });
    expect(await runBillingReminders(payload)).toEqual({});

    await setTrialEnd(-1); // inside the grace period
    expect(await runBillingReminders(payload)).toEqual({ owner_grace: 1 });
    await setTrialEnd(-4); // locked yesterday
    expect(await runBillingReminders(payload)).toEqual({ owner_paused: 1 });
    await setTrialEnd(-30); // locked weeks ago - no email on first deploy
    expect(await runBillingReminders(payload)).toEqual({});
  });

  it('sends the digest on Monday mornings only, once per week', async () => {
    const tuesday = new Date('2026-11-17T09:00:00Z');
    const mondayMorning = new Date('2026-11-16T05:00:00Z'); // 08:00 Nairobi
    expect(await runPlatformDigest(payload, tuesday)).toBe('not_due');
    expect(await runPlatformDigest(payload, mondayMorning)).toBe('logged');
    expect(await runPlatformDigest(payload, new Date(mondayMorning.getTime() + 3600_000))).toBe('duplicate');
    const digest = (await notifications()).find((n) => n.kind === 'operator_digest');
    expect(digest).toMatchObject({ to: 'ops@fundi.test' });
  });

  it('sends through Brevo when a key is set, and frees the key for retry on failure', async () => {
    process.env.BREVO_API_KEY = 'test-key';
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ messageId: '<m1@brevo>' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const base = { key: 'test:1', kind: 'test', to: ['A@Example.com'], subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' };
    expect(await sendEmail(payload, base)).toBe('sent');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('test-key');
    expect(JSON.parse(String(init.body))).toMatchObject({
      to: [{ email: 'a@example.com' }],
      subject: 'Hi',
      sender: { email: 'billing@fundipos.co.ke' },
    });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'bad sender' }), { status: 400 })));
    expect(await sendEmail(payload, { ...base, key: 'test:2' })).toBe('failed');
    expect(await sendEmail(payload, { ...base, key: 'test:2' })).toBe('failed'); // retried, not 'duplicate'
  });
});
