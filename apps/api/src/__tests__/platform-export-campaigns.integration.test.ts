import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayload, type Payload } from 'payload';
import config from '../payload.config.ts';
import { flushActivity } from '../lib/activity.ts';
import { flushBackground } from '../lib/background.ts';
import { unsubscribeToken } from '../lib/campaigns.ts';

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
    'platform_campaigns', 'devices', 'trial_grants', 'platform_notifications', 'trial_extension_requests', 'tenant_activity_days',
    'platform_tenant_notes', 'subscription_payments', 'orders_line_items', 'orders', 'stock_movements', 'products_variants', 'products',
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

describe('Platform exports and campaigns', () => {
  let admin: any;
  let shopA: number;
  let shopB: number;

  beforeEach(async () => {
    await truncateAll();
    authHeaders = {};
    delete process.env.BREVO_API_KEY;
    process.env.PLATFORM_NOTIFY_EMAIL = 'ops@fundi.test';
    const adminDoc = await payload.create({
      collection: 'platform-admins',
      data: { name: 'Ops', email: 'ops@fundi.test', password: 'pw123456' } as any,
      overrideAccess: true,
    });
    admin = { ...adminDoc, collection: 'platform-admins' };
    // Two shops that signed up 10 days ago and never sold: "never started".
    const old = new Date(Date.now() - 10 * DAY).toISOString();
    for (const [name, email] of [
      ['Embu "Bolts", Ltd', 'a@embu.test'],
      ['Meru Tiles', 'b@meru.test'],
    ]) {
      const t = await payload.create({
        collection: 'tenants',
        data: {
          name,
          status: 'active',
          subscriptionTier: 'trial',
          billingStatus: 'trialing',
          trialEndsAt: new Date(Date.now() + 4 * DAY).toISOString(),
        },
        overrideAccess: true,
      });
      await payload.db.drizzle.execute(`UPDATE tenants SET created_at = '${old}' WHERE id = ${t.id}`);
      await payload.create({
        collection: 'users',
        data: { tenant: t.id, role: 'owner', status: 'active', email, password: 'pw123456', name: name === 'Meru Tiles' ? 'Kendi Mutua' : undefined },
        overrideAccess: true,
      });
      if (name === 'Meru Tiles') shopB = t.id as number;
      else shopA = t.id as number;
    }
    await payload.create({
      collection: 'subscription-payments',
      data: { tenant: shopB, amount: 1000, method: 'mpesa', reference: 'QJK7EXPORT', paidAt: new Date(Date.now() - 2 * DAY).toISOString() } as any,
      user: admin,
      overrideAccess: false,
    });
    const { token } = await payload.login({ collection: 'platform-admins', data: { email: 'ops@fundi.test', password: 'pw123456' } });
    authHeaders = { Authorization: `JWT ${token}` };
  });

  async function exportCsv(query: string) {
    const { GET } = await import('../app/api/platform-export/route.ts');
    return GET(new Request(`http://test/api/platform-export?${query}`));
  }
  async function campaign(body: Record<string, unknown>) {
    const { POST } = await import('../app/api/platform-campaign/route.ts');
    return POST(new Request('http://test', { method: 'POST', body: JSON.stringify(body) }));
  }

  it('exports tenants and payments as CSV, quoting awkward names, for platform admins only', async () => {
    const res = await exportCsv('dataset=tenants');
    expect(res.headers.get('content-type')).toMatch(/text\/csv/);
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="fundi-tenants-/);
    // UTF-8 BOM in the bytes (Response.text() itself strips it while decoding).
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = await res.text();
    expect(csv).toContain('"Embu ""Bolts"", Ltd"');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(3);

    const payments = await (await exportCsv('dataset=payments')).text();
    expect(payments).toContain('QJK7EXPORT');
    const outOfRange = await (await exportCsv('dataset=payments&from=2020-01-01&to=2020-01-31')).text();
    expect(outOfRange).not.toContain('QJK7EXPORT');

    expect((await exportCsv('dataset=nope')).status).toBe(400);
    authHeaders = {};
    expect((await exportCsv('dataset=tenants')).status).toBe(401);
  });

  it('previews a segment, sends once per shop with names filled in, and needs a fresh preview', async () => {
    const draft = { segment: 'never_started', subject: 'Hi {{owner}} at {{shop}}', body: 'Hello {{owner}},\n\nLet us get {{shop}} selling.' };
    const preview = await (await campaign({ action: 'preview', ...draft })).json();
    expect(preview).toMatchObject({ count: 2, optedOut: 0 });
    expect(preview.sample.html).toContain('unsubscribe?t=');

    expect((await campaign({ action: 'send', ...draft, confirmCount: 5 })).status).toBe(409);
    const sent = await campaign({ action: 'send', ...draft, confirmCount: 2 });
    expect(sent.status).toBe(201);
    await flushBackground();

    const emails = await payload.find({ collection: 'platform-notifications', where: { kind: { equals: 'campaign' } }, sort: 'to', overrideAccess: true });
    expect(emails.docs.map((e) => [e.to, e.subject])).toEqual([
      ['a@embu.test', 'Hi there at Embu "Bolts", Ltd'],
      ['b@meru.test', 'Hi Kendi at Meru Tiles'],
    ]);
    const record = await payload.find({ collection: 'platform-campaigns', overrideAccess: true });
    expect(record.docs[0]).toMatchObject({ recipients: 2, segment: 'never_started' });
  });

  it('honours a signed unsubscribe link and rejects a forged one', async () => {
    const { POST } = await import('../app/api/unsubscribe/route.ts');
    const forged = await POST(
      new Request('http://test', { method: 'POST', body: JSON.stringify({ token: `${shopA}.not-the-real-signature-xxxxxxxxx` }) }),
    );
    expect(forged.status).toBe(400);
    const swapped = unsubscribeToken(payload, shopB).replace(String(shopB), String(shopA));
    const other = await POST(new Request('http://test', { method: 'POST', body: JSON.stringify({ token: swapped }) }));
    expect(other.status).toBe(400);

    const ok = await POST(new Request('http://test', { method: 'POST', body: JSON.stringify({ token: unsubscribeToken(payload, shopA) }) }));
    expect(await ok.json()).toMatchObject({ shop: 'Embu "Bolts", Ltd' });

    const preview = await (await campaign({ action: 'preview', segment: 'never_started', subject: 'x', body: 'y' })).json();
    expect(preview).toMatchObject({ count: 1, optedOut: 1, names: ['Meru Tiles'] });
  });
});
