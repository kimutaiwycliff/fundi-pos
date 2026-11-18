import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayload, type Payload } from 'payload';
import config from '../payload.config.ts';
import { flushActivity } from '../lib/activity.ts';
import { flushBackground } from '../lib/background.ts';
import { runScheduledPurges } from '../lib/notifications.ts';
import { canonicalEmail } from '../lib/trialGrants.ts';

let authHeaders: Record<string, string> = {};
vi.mock('next/headers', () => ({
  headers: async () => new Headers(authHeaders),
}));

let payload: Payload;
const DAY = 24 * 60 * 60 * 1000;

async function truncateAll() {
  await flushActivity();
  await flushBackground();
  const tables = [
    'devices', 'trial_grants', 'platform_notifications', 'trial_extension_requests', 'tenant_activity_days', 'platform_tenant_notes',
    'subscription_payments', 'audit_log', 'users_sessions', 'users', 'stores', 'platform_audit_log', 'platform_admins_sessions',
    'platform_admins', 'tenants_addons', 'tenants',
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

describe('Platform lifecycle: provisioning, repeat trials, scheduled purges, tills', () => {
  beforeEach(async () => {
    await truncateAll();
    authHeaders = {};
    process.env.PLATFORM_NOTIFY_EMAIL = 'ops@fundi.test';
    await payload.create({
      collection: 'platform-admins',
      data: { name: 'Ops', email: 'ops@fundi.test', password: 'pw123456' } as any,
      overrideAccess: true,
    });
  });

  async function asAdmin() {
    const { token } = await payload.login({ collection: 'platform-admins', data: { email: 'ops@fundi.test', password: 'pw123456' } });
    authHeaders = { Authorization: `JWT ${token}` };
  }
  async function provision(body: Record<string, unknown>) {
    const { POST } = await import('../app/api/platform-provision/route.ts');
    return POST(new Request('http://test', { method: 'POST', body: JSON.stringify(body) }));
  }
  async function signup(body: Record<string, unknown>, ip = '41.90.1.1') {
    const { POST } = await import('../app/api/auth/signup/route.ts');
    return POST(new Request('http://test', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': ip } }));
  }

  it('canonicalises emails the way repeat-trial matching needs', () => {
    expect(canonicalEmail('Jane.Doe+shop2@GoogleMail.com')).toBe('janedoe@gmail.com');
    expect(canonicalEmail('jane.doe+x@biz.co.ke')).toBe('jane.doe@biz.co.ke');
  });

  it('adds a tenant and owner from the console, with a working set-password link', async () => {
    await asAdmin();
    const res = await provision({
      businessName: 'Thika Hardware',
      ownerName: 'Mary Wanjiru',
      ownerEmail: 'Owner@Thika.test',
      ownerPhone: '0712345678',
      trialDays: 21,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.setPasswordLink).toMatch(/\/set-password\?token=/);

    const tenant = await payload.findByID({ collection: 'tenants', id: body.tenantId, overrideAccess: true });
    expect(tenant).toMatchObject({ name: 'Thika Hardware', subscriptionTier: 'trial', billingStatus: 'trialing' });
    expect((new Date(tenant.trialEndsAt as string).getTime() - Date.now()) / DAY).toBeGreaterThan(20.9);

    // The link's token sets the owner's password and logs them in.
    const token = decodeURIComponent(body.setPasswordLink.split('token=')[1]);
    const reset = await payload.resetPassword({ collection: 'users', data: { token, password: 'chosen-pw-1' }, overrideAccess: true });
    expect(reset.token).toBeTruthy();
    await expect(payload.login({ collection: 'users', data: { email: 'owner@thika.test', password: 'chosen-pw-1' } })).resolves.toBeTruthy();

    const audit = await payload.find({ collection: 'platform-audit-log', where: { action: { equals: 'tenant_provisioned' } }, overrideAccess: true });
    expect(audit.totalDocs).toBe(1);
    await flushBackground();
    const welcome = await payload.find({ collection: 'platform-notifications', where: { kind: { equals: 'owner_welcome' } }, overrideAccess: true });
    expect(welcome.docs[0]).toMatchObject({ to: 'owner@thika.test' });
  });

  it('refuses an existing account, and warns about a repeat trial unless overridden', async () => {
    const first = await signup({ businessName: 'Juja Tools', email: 'jane.doe@gmail.com', password: 'longenough1' });
    expect(first.status).toBeLessThan(300);
    await asAdmin();

    expect((await provision({ businessName: 'Again', ownerEmail: 'jane.doe@gmail.com' })).status).toBe(409);

    const repeat = await provision({ businessName: 'Juja Tools 2', ownerEmail: 'janedoe+new@gmail.com' });
    expect(repeat.status).toBe(409);
    const body = await repeat.json();
    expect(body).toMatchObject({ code: 'prior_trial' });
    expect(body.priors[0]).toMatchObject({ businessName: 'Juja Tools', matchedOn: ['email'] });

    const granted = await provision({ businessName: 'Juja Tools 2', ownerEmail: 'janedoe+new@gmail.com', allowRepeatTrial: true });
    expect(granted.status).toBe(201);
    const { GET } = await import('../app/api/platform-stats/route.ts');
    const stats = await (await GET(new Request('http://test/api/platform-stats?fresh'))).json();
    expect(stats.tenants.find((t: any) => t.name === 'Juja Tools 2').repeatTrial).toBe(true);
    expect(stats.tenants.find((t: any) => t.name === 'Juja Tools').repeatTrial).toBe(false);
  });

  it('flags a self-serve repeat trial in the operator sign-up email', async () => {
    await signup({ businessName: 'Kiambu Paints', email: 'paints@kiambu.test', password: 'longenough1' });
    await signup({ businessName: 'Kiambu Paints Two', email: 'paints+2@kiambu.test', password: 'longenough1' });
    await flushBackground();
    const alerts = await payload.find({
      collection: 'platform-notifications',
      where: { kind: { equals: 'operator_signup' } },
      sort: 'createdAt',
      overrideAccess: true,
    });
    expect(alerts.docs.map((d) => d.subject)).toEqual(['New sign-up: Kiambu Paints', 'Repeat trial? New sign-up: Kiambu Paints Two']);
  });

  it('schedules a soft-deleted tenant for purge in 30 days, which restore cancels', async () => {
    const tenant = await payload.create({
      collection: 'tenants',
      data: { name: 'Nyeri Steel', status: 'active', subscriptionTier: 'trial', billingStatus: 'trialing' },
      overrideAccess: true,
    });
    let t = await payload.update({ collection: 'tenants', id: tenant.id, data: { status: 'deleted' }, overrideAccess: true });
    const days = (new Date(t.scheduledPurgeAt as string).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);

    t = await payload.update({ collection: 'tenants', id: tenant.id, data: { status: 'active' }, overrideAccess: true });
    expect(t.scheduledPurgeAt).toBeFalsy();

    await payload.update({ collection: 'tenants', id: tenant.id, data: { status: 'deleted' }, overrideAccess: true });
    expect(await runScheduledPurges(payload)).toEqual({ purged: 0, failed: 0 });
    expect(await runScheduledPurges(payload, new Date(Date.now() + 31 * DAY))).toEqual({ purged: 1, failed: 0 });
    const left = await payload.find({ collection: 'tenants', where: { id: { equals: tenant.id } }, overrideAccess: true });
    expect(left.totalDocs).toBe(0);
    const audit = await payload.find({ collection: 'platform-audit-log', where: { action: { equals: 'tenant_purged' } }, overrideAccess: true });
    expect(audit.docs[0].summary).toMatch(/Nyeri Steel permanently deleted/);
  });

  it('registers tills and signs out a revoked one', async () => {
    const tenant = await payload.create({
      collection: 'tenants',
      data: {
        name: 'Machakos Build',
        status: 'active',
        subscriptionTier: 'starter',
        billingStatus: 'active',
        paidUntil: new Date(Date.now() + 20 * DAY).toISOString(),
      },
      overrideAccess: true,
    });
    await payload.create({
      collection: 'users',
      data: { tenant: tenant.id, role: 'owner', status: 'active', email: 'owner@machakos.test', password: 'pw123456' },
      overrideAccess: true,
    });
    const till = { 'x-fundi-terminal': 'till-abc-123', 'x-fundi-terminal-name': encodeURIComponent('Front counter'), 'x-fundi-client': 'desktop' };
    const { token } = await payload.login({ collection: 'users', data: { email: 'owner@machakos.test', password: 'pw123456' } });
    authHeaders = { Authorization: `JWT ${token}`, ...till };
    const { POST } = await import('../app/api/auth/till-refresh/route.ts');
    expect((await POST()).status).toBe(200);
    await flushBackground();

    const devices = await payload.find({ collection: 'devices', overrideAccess: true });
    expect(devices.docs).toHaveLength(1);
    expect(devices.docs[0]).toMatchObject({ terminalId: 'till-abc-123', name: 'Front counter', platform: 'desktop' });

    const admin = { ...(await payload.find({ collection: 'platform-admins', overrideAccess: true })).docs[0], collection: 'platform-admins' } as any;
    await payload.update({
      collection: 'devices',
      id: devices.docs[0].id,
      data: { revokedAt: new Date().toISOString(), revokeReason: 'stolen' },
      user: admin,
      overrideAccess: false,
    });

    const refused = await POST();
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'access_revoked', reason: 'device_revoked' });

    // The same owner on another (unrevoked) till is fine.
    authHeaders = { Authorization: `JWT ${token}`, 'x-fundi-terminal': 'till-other' };
    expect((await POST()).status).toBe(200);

    await payload.update({ collection: 'devices', id: devices.docs[0].id, data: { revokedAt: null }, user: admin, overrideAccess: false });
    authHeaders = { Authorization: `JWT ${token}`, ...till };
    expect((await POST()).status).toBe(200);
    const audit = await payload.find({ collection: 'platform-audit-log', sort: 'createdAt', overrideAccess: true });
    expect(audit.docs.map((d) => d.action)).toEqual(['device_revoked', 'device_restored']);
  });
});
