import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayload, type Payload } from 'payload';
import config from '../payload.config.ts';
import { flushActivity } from '../lib/activity.ts';
import { flushBackground } from '../lib/background.ts';
import { base32Encode, totpAt, verifyTotp } from '../lib/totp.ts';

let authHeaders: Record<string, string> = {};
vi.mock('next/headers', () => ({
  headers: async () => new Headers(authHeaders),
}));

// Google's side is mocked: verifyGoogleIdToken returns whoever the test says.
let googleIdentity = { sub: 'g-123', email: 'owner@nanyuki.test', name: 'Akinyi Otieno' };
vi.mock('../lib/google.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/google.ts')>();
  return { ...real, verifyGoogleIdToken: async () => googleIdentity };
});

let payload: Payload;
const DAY = 24 * 60 * 60 * 1000;

async function truncateAll() {
  await flushActivity();
  await flushBackground();
  const tables = [
    'platform_campaigns', 'devices', 'trial_grants', 'platform_notifications', 'trial_extension_requests', 'tenant_activity_days',
    'platform_tenant_notes', 'subscription_payments', 'audit_log', 'users_sessions', 'users', 'stores', 'platform_audit_log',
    'platform_admins_sessions', 'platform_admins', 'tenants_addons', 'tenants',
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

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://test', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 test vector and allows one step of drift', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(totpAt(secret, 59_000)).toBe('287082');
    expect(verifyTotp(secret, '287082', 59_000 + 30_000)).toBe(true);
    expect(verifyTotp(secret, '287082', 59_000 + 90_000)).toBe(false);
  });
});

describe('Forgot password, Google sign-in, console 2-step', () => {
  let tenantId: number;

  beforeEach(async () => {
    await truncateAll();
    authHeaders = {};
    googleIdentity = { sub: 'g-123', email: 'owner@nanyuki.test', name: 'Akinyi Otieno' };
    process.env.PLATFORM_NOTIFY_EMAIL = 'ops@fundi.test';
    tenantId = (
      await payload.create({
        collection: 'tenants',
        data: { name: 'Nanyuki Hardware', status: 'active', subscriptionTier: 'trial', billingStatus: 'trialing' },
        overrideAccess: true,
      })
    ).id as number;
    await payload.create({
      collection: 'users',
      data: { tenant: tenantId, role: 'owner', status: 'active', email: 'owner@nanyuki.test', password: 'pw123456', name: 'Akinyi' },
      overrideAccess: true,
    });
  });

  it('emails a reset link for a known email and answers the same for an unknown one', async () => {
    const { POST } = await import('../app/api/auth/forgot-password/route.ts');
    const known = await POST(post({ email: 'Owner@Nanyuki.test' }, { 'x-forwarded-for': '10.0.0.1' }));
    const unknown = await POST(post({ email: 'nobody@nowhere.test' }, { 'x-forwarded-for': '10.0.0.1' }));
    expect(known.status).toBe(200);
    expect(await unknown.json()).toEqual(await known.json());
    await flushBackground();
    const sent = await payload.find({ collection: 'platform-notifications', where: { kind: { equals: 'password_reset' } }, overrideAccess: true });
    expect(sent.docs).toHaveLength(1);
    expect(sent.docs[0]).toMatchObject({ to: 'owner@nanyuki.test' });

    // 3 per email per hour
    await POST(post({ email: 'owner@nanyuki.test' }, { 'x-forwarded-for': '10.0.0.2' }));
    await POST(post({ email: 'owner@nanyuki.test' }, { 'x-forwarded-for': '10.0.0.3' }));
    expect((await POST(post({ email: 'owner@nanyuki.test' }, { 'x-forwarded-for': '10.0.0.4' }))).status).toBe(429);
  });

  it('signs an existing user in with Google and links the account', async () => {
    const { POST } = await import('../app/api/auth/google/route.ts');
    const res = await POST(post({ idToken: 'x', nonce: 'n' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.token).toBeTruthy();
    const me = await payload.auth({ headers: new Headers({ Authorization: `JWT ${body.token}` }) });
    expect(me.user).toMatchObject({ email: 'owner@nanyuki.test' });
    const linked = await payload.find({ collection: 'users', where: { googleSub: { equals: 'g-123' } }, overrideAccess: true });
    expect(linked.totalDocs).toBe(1);
  });

  it('refuses Google sign-in when the shop is locked out', async () => {
    await payload.update({
      collection: 'tenants',
      id: tenantId,
      data: { trialEndsAt: new Date(Date.now() - 10 * DAY).toISOString() },
      overrideAccess: true,
    });
    const { POST } = await import('../app/api/auth/google/route.ts');
    const res = await POST(post({ idToken: 'x' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'trial_ended' });
  });

  it('creates a shop for a first-time Google user after the shop-name step', async () => {
    googleIdentity = { sub: 'g-999', email: 'new@kitui.test', name: 'Mutua Kilonzo' };
    const { POST } = await import('../app/api/auth/google/route.ts');
    const first = await (await POST(post({ idToken: 'x' }))).json();
    expect(first.signupToken).toBeTruthy();
    expect(first.token).toBeUndefined();

    const signup = await import('../app/api/auth/google/signup/route.ts');
    expect((await signup.POST(post({ signupToken: 'forged', businessName: 'X' }))).status).toBe(401);
    const res = await signup.POST(post({ signupToken: first.signupToken, businessName: 'Kitui Cement' }));
    expect(res.status).toBe(201);
    const { token } = await res.json();
    const me = await payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) });
    expect(me.user).toMatchObject({ email: 'new@kitui.test', role: 'owner' });
    const grants = await payload.find({ collection: 'trial-grants', where: { googleSub: { equals: 'g-999' } }, overrideAccess: true });
    expect(grants.docs[0]).toMatchObject({ businessName: 'Kitui Cement', source: 'signup' });
    // Same Google account again is now just a sign-in.
    expect((await (await POST(post({ idToken: 'x' }))).json()).token).toBeTruthy();
  });

  it('requires the 2-step code at console login once it is turned on', async () => {
    await payload.create({
      collection: 'platform-admins',
      data: { name: 'Ops', email: 'ops@fundi.test', password: 'pw123456' } as any,
      overrideAccess: true,
    });
    const { token } = await payload.login({ collection: 'platform-admins', data: { email: 'ops@fundi.test', password: 'pw123456' } });
    authHeaders = { Authorization: `JWT ${token}` };
    const twoStep = await import('../app/api/platform-2fa/route.ts');
    const setup = await (await twoStep.POST(post({ action: 'setup' }))).json();
    expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\/Fundi%20POS:ops%40fundi.test\?secret=/);
    expect((await twoStep.POST(post({ action: 'enable', code: '000000' }))).status).toBe(400);
    expect((await twoStep.POST(post({ action: 'enable', code: totpAt(setup.secret, Date.now()) }))).status).toBe(200);

    const login = (data: Record<string, unknown>) => payload.login({ collection: 'platform-admins', data: data as any, req: { data } as any });
    await expect(login({ email: 'ops@fundi.test', password: 'pw123456' })).rejects.toThrow(/6-digit code/);
    await expect(login({ email: 'ops@fundi.test', password: 'pw123456', totp: '123456' })).rejects.toThrow(/wrong or has expired/);
    await expect(login({ email: 'ops@fundi.test', password: 'pw123456', totp: totpAt(setup.secret, Date.now()) })).resolves.toBeTruthy();

    // The handoff into /admin: one-time link that sets Payload's admin cookie.
    const handoff = await import('../app/api/platform-admin-handoff/route.ts');
    const { url } = await (await handoff.POST(new Request('http://test/api/platform-admin-handoff', { method: 'POST' }))).json();
    const opened = await handoff.GET(new Request(url));
    expect(opened.status).toBe(302);
    expect(opened.headers.get('location')).toBe('/admin');
    expect(opened.headers.get('set-cookie')).toMatch(/^payload-token=.+HttpOnly/);
    expect((await handoff.GET(new Request(url))).status).toBe(401); // single use
  });
});
