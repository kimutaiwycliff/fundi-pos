import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayload, type Payload } from 'payload';
import config from '../payload.config.ts';

// The report/validate routes authenticate via next/headers - stubbed here
// with a real JWT minted by payload.login(), so they run their genuine
// auth + query code end to end.
let authHeader: string | null = null;
vi.mock('next/headers', () => ({
  headers: async () => new Headers(authHeader ? { Authorization: authHeader } : {}),
}));

let payload: Payload;

function asUser(user: { id: number; tenant: number; role: string }) {
  return { ...user, tenant: { id: user.tenant }, collection: 'users' } as any;
}

async function truncateAll() {
  const tables = [
    'orders_line_items', 'orders', 'stock_movements', 'products_variants', 'products', 'promo_codes',
    'customers', 'users_sessions', 'users', 'stores', 'platform_audit_log', 'platform_admins_sessions',
    'platform_admins', 'tenants_addons', 'tenants',
  ];
  await payload.db.drizzle.execute(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`);
}

describe('Sell Online add-on + marketing features', () => {
  let tenantId: number;
  let storeId: number;
  let ownerId: number;
  let cashierId: number;
  let productId: number;
  let owner: any;
  let cashier: any;

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
      data: { name: 'Mama Baby Boutique', status: 'active', subscriptionTier: 'starter', billingStatus: 'active' },
      overrideAccess: true,
    });
    tenantId = tenant.id as number;
    const store = await payload.create({
      collection: 'stores',
      data: { tenant: tenantId, name: 'Main', timezone: 'Africa/Nairobi' },
      overrideAccess: true,
    });
    storeId = store.id as number;
    const ownerDoc = await payload.create({
      collection: 'users',
      data: { tenant: tenantId, role: 'owner', status: 'active', email: 'owner@test.local', password: 'pw123456' },
      overrideAccess: true,
    });
    ownerId = ownerDoc.id as number;
    const cashierDoc = await payload.create({
      collection: 'users',
      data: { tenant: tenantId, store: storeId, role: 'cashier', status: 'active', email: 'cashier@test.local', password: 'pw123456' },
      overrideAccess: true,
    });
    cashierId = cashierDoc.id as number;
    owner = asUser({ id: ownerId, tenant: tenantId, role: 'owner' });
    cashier = asUser({ id: cashierId, tenant: tenantId, role: 'cashier' });

    const product = await payload.create({
      collection: 'products',
      data: { tenant: tenantId, sku: 'ROMPER', name: 'Romper set', costPrice: 400, sellPrice: 1000, taxRate: 0.16, reorderPoint: 0, maxDiscountAmount: 0 },
      overrideAccess: true,
      draft: false,
    });
    productId = product.id as number;
    await payload.create({
      collection: 'stock-movements',
      data: {
        id: crypto.randomUUID(), tenant: tenantId, store: storeId, product: productId,
        quantityDelta: 20, reason: 'restock', clientTimestamp: new Date().toISOString(), sourceTerminal: 'seed',
      },
      overrideAccess: true,
    });
  });

  async function enableAddon() {
    await payload.update({ collection: 'tenants', id: tenantId, data: { addons: ['sell_online'] }, overrideAccess: true });
  }

  function sell(extra: Record<string, unknown> = {}, quantity = 2) {
    return payload.create({
      collection: 'orders',
      data: {
        id: crypto.randomUUID(), tenant: tenantId, store: storeId, terminal: 'till-1', cashier: cashierId,
        lineItems: [{ product: productId, quantity, unitPrice: 1000, discount: 0 }],
        taxTotal: 0, discountTotal: 0, total: 0,
        tenderType: 'cash', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
        ...extra,
      } as any,
      user: cashier,
      overrideAccess: false,
      draft: false,
    });
  }

  async function createPromo(data: Record<string, unknown>) {
    return payload.create({
      collection: 'promo-codes',
      data: { tenant: tenantId, kind: 'percentage', value: 10, ...data } as any,
      user: owner,
      overrideAccess: false,
    });
  }

  describe('add-on switch', () => {
    it("can't be switched on by the tenant's own owner", async () => {
      await payload.update({ collection: 'tenants', id: tenantId, data: { addons: ['sell_online'] } as any, user: owner, overrideAccess: false });
      const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true });
      expect(tenant.addons ?? []).toEqual([]);
    });

    it('is logged to the platform audit log when a platform admin toggles it', async () => {
      const admin = await payload.create({
        collection: 'platform-admins',
        data: { name: 'Ops', email: 'admin@test.local', password: 'pw123456' } as any,
        overrideAccess: true,
      });
      const adminUser = { ...admin, collection: 'platform-admins' } as any;
      await payload.update({ collection: 'tenants', id: tenantId, data: { addons: ['sell_online'] }, user: adminUser, overrideAccess: false });
      await payload.update({ collection: 'tenants', id: tenantId, data: { addons: [] }, user: adminUser, overrideAccess: false });

      const log = await payload.find({ collection: 'platform-audit-log', where: { action: { equals: 'addon_changed' } }, sort: 'createdAt', overrideAccess: true });
      expect(log.docs.map((d) => d.summary)).toEqual([
        'Mama Baby Boutique: enabled Sell Online',
        'Mama Baby Boutique: disabled Sell Online',
      ]);
      const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true });
      expect(tenant.addonsChangedAt).toBeTruthy();
    });

    it('still lets an owner save the core marketing settings and normalizes them', async () => {
      const updated = await payload.update({
        collection: 'tenants',
        id: tenantId,
        data: { whatsappNumber: '+254 712 345 678', shopSlug: 'Mama Baby!', socialHandles: '@mama.ke' },
        user: owner,
        overrideAccess: false,
      });
      expect(updated.whatsappNumber).toBe('0712345678');
      expect(updated.shopSlug).toBe('mama-baby');
      await expect(
        payload.update({ collection: 'tenants', id: tenantId, data: { whatsappNumber: '12' }, user: owner, overrideAccess: false }),
      ).rejects.toThrow(/WhatsApp/);
    });
  });

  describe('sales channel', () => {
    it('defaults to walk-in and stores what the till picked', async () => {
      expect((await sell()).channel).toBe('walk_in');
      expect((await sell({ channel: 'tiktok' })).channel).toBe('tiktok');
    });
  });

  describe('promo codes', () => {
    it('cannot be created without the add-on', async () => {
      // Neutral wording - must not reveal that an add-on exists.
      await expect(createPromo({ code: 'BF2026' })).rejects.toThrow(/aren't available/);
    });

    it('are normalized and unique per tenant', async () => {
      await enableAddon();
      const promo = await createPromo({ code: ' bf 2026 ' });
      expect(promo.code).toBe('BF2026');
      await expect(createPromo({ code: 'bf2026' })).rejects.toThrow(/already exists/);
      await expect(createPromo({ code: 'X1', value: 10 })).rejects.toThrow(/3-30/);
      await expect(createPromo({ code: 'TOOMUCH', value: 150 })).rejects.toThrow(/100/);
    });

    it('are priced server-side on the order, counted, and un-counted on void', async () => {
      await enableAddon();
      const promo = await createPromo({ code: 'BF2026', value: 15 });
      const order = await sell({ promoCodeText: 'bf2026', promoDiscount: 999, total: 1 });
      expect(order.promoDiscount).toBe(300); // 15% of 2000 - client's 999 ignored
      expect(order.total).toBe(1700);
      expect(order.discountTotal).toBe(300);
      expect(order.promoCodeText).toBe('BF2026');
      let reloaded = await payload.findByID({ collection: 'promo-codes', id: promo.id, overrideAccess: true });
      expect(reloaded.usesCount).toBe(1);

      await payload.update({ collection: 'orders', id: order.id, data: { status: 'voided' }, overrideAccess: true });
      reloaded = await payload.findByID({ collection: 'promo-codes', id: promo.id, overrideAccess: true });
      expect(reloaded.usesCount).toBe(0);
    });

    it('reject expired, unknown and used-up codes, and any code once the add-on is off', async () => {
      await enableAddon();
      await createPromo({ code: 'OLDCODE', endsAt: '2020-01-01T00:00:00Z' });
      await createPromo({ code: 'ONCE', maxUses: 1 });
      await expect(sell({ promoCodeText: 'OLDCODE' })).rejects.toThrow(/expired/);
      await expect(sell({ promoCodeText: 'NOPE' })).rejects.toThrow(/doesn't exist/);
      await sell({ promoCodeText: 'ONCE' });
      await expect(sell({ promoCodeText: 'ONCE' })).rejects.toThrow(/usage limit/);

      await payload.update({ collection: 'tenants', id: tenantId, data: { addons: [] }, overrideAccess: true });
      await expect(sell({ promoCodeText: 'ONCE' })).rejects.toThrow(/aren't available/);
      // ...but ordinary sales are untouched by the add-on being off.
      expect((await sell()).total).toBe(2000);
    });

    it('reward the referrer with points (not for self-use) and take them back on void', async () => {
      await enableAddon();
      const referrer = await payload.create({ collection: 'customers', data: { tenant: tenantId, name: 'Jane', loyaltyPoints: 0 }, overrideAccess: true });
      const buyer = await payload.create({ collection: 'customers', data: { tenant: tenantId, name: 'Amina', loyaltyPoints: 0 }, overrideAccess: true });
      await createPromo({ code: 'JANE200', kind: 'flat', value: 200, referrerCustomer: referrer.id, referrerRewardPoints: 50 });

      const order = await sell({ promoCodeText: 'JANE200', customer: buyer.id });
      expect(order.total).toBe(1800);
      expect(order.referrerPointsAwarded).toBe(50);
      let jane = await payload.findByID({ collection: 'customers', id: referrer.id, overrideAccess: true });
      expect(jane.loyaltyPoints).toBe(50);

      const selfUse = await sell({ promoCodeText: 'JANE200', customer: referrer.id });
      expect(selfUse.referrerPointsAwarded).toBe(0);

      await payload.update({ collection: 'orders', id: order.id, data: { status: 'refunded' }, overrideAccess: true });
      jane = await payload.findByID({ collection: 'customers', id: referrer.id, overrideAccess: true });
      // 50 reward taken back; her own self-use sale still earned 18 points.
      expect(jane.loyaltyPoints).toBe(18);
    });
  });

  describe('loyalty redemption (every plan)', () => {
    it('takes points off the bill, nets them against points earned, and restores both on void', async () => {
      const customer = await payload.create({ collection: 'customers', data: { tenant: tenantId, name: 'Amina', loyaltyPoints: 120 }, overrideAccess: true });
      const order = await sell({ customer: customer.id, loyaltyPointsRedeemed: 100 });
      expect(order.loyaltyDiscount).toBe(100);
      expect(order.total).toBe(1900);
      expect(order.loyaltyPointsEarned).toBe(19);
      let reloaded = await payload.findByID({ collection: 'customers', id: customer.id, overrideAccess: true });
      expect(reloaded.loyaltyPoints).toBe(39); // 120 - 100 + 19

      await payload.update({ collection: 'orders', id: order.id, data: { status: 'voided' }, overrideAccess: true });
      reloaded = await payload.findByID({ collection: 'customers', id: customer.id, overrideAccess: true });
      expect(reloaded.loyaltyPoints).toBe(120);
    });

    it('refuses more points than the customer has, or redemption with no customer', async () => {
      const customer = await payload.create({ collection: 'customers', data: { tenant: tenantId, name: 'Amina', loyaltyPoints: 10 }, overrideAccess: true });
      await expect(sell({ customer: customer.id, loyaltyPointsRedeemed: 50 })).rejects.toThrow(/only has 10/);
      await expect(sell({ loyaltyPointsRedeemed: 5 })).rejects.toThrow(/customer/);
    });

    it('respects the shop point value and lets owners turn redemption off', async () => {
      const customer = await payload.create({ collection: 'customers', data: { tenant: tenantId, name: 'Amina', loyaltyPoints: 100 }, overrideAccess: true });
      await payload.update({ collection: 'tenants', id: tenantId, data: { loyaltyPointValue: 2 }, overrideAccess: true });
      expect((await sell({ customer: customer.id, loyaltyPointsRedeemed: 50 })).loyaltyDiscount).toBe(100);
      await payload.update({ collection: 'tenants', id: tenantId, data: { loyaltyPointValue: 0 }, overrideAccess: true });
      await expect(sell({ customer: customer.id, loyaltyPointsRedeemed: 10 })).rejects.toThrow(/turned off/);
    });
  });

  describe('public storefront', () => {
    async function getShop(slug: string) {
      const { GET } = await import('../app/api/storefront/[slug]/route.ts');
      const response = await GET(new Request(`http://test/api/storefront/${slug}`), { params: Promise.resolve({ slug }) });
      return { status: response.status, body: await response.json() };
    }

    it('is new tenants\' default: add-on off, and the shop 404s as if it never existed', async () => {
      const fresh = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true });
      expect(fresh.addons ?? []).toEqual([]);
      expect((await getShop('nobody-here')).status).toBe(404);
      // Even with a slug + "open" saved, no add-on means no shop at all.
      await payload.update({
        collection: 'tenants',
        id: tenantId,
        data: { shopSlug: 'mama-baby', storefrontEnabled: true, whatsappNumber: '0712345678' },
        overrideAccess: true,
      });
      expect((await getShop('mama-baby')).status).toBe(404);
    });

    it('shows a paused page when the add-on is on but the owner closed the shop', async () => {
      await payload.update({
        collection: 'tenants',
        id: tenantId,
        data: { shopSlug: 'mama-baby', whatsappNumber: '0712345678', addons: ['sell_online'] },
        overrideAccess: true,
      });
      const paused = await getShop('mama-baby');
      expect(paused.status).toBe(200);
      expect(paused.body.available).toBe(false);
      expect(paused.body.shop.whatsappNumber).toBe('0712345678');
      expect(paused.body.products).toEqual([]);
    });

    it('lists only products marked online, without cost or stock counts', async () => {
      await payload.update({
        collection: 'tenants',
        id: tenantId,
        data: { shopSlug: 'mama-baby', storefrontEnabled: true, addons: ['sell_online'] },
        overrideAccess: true,
      });
      await payload.create({
        collection: 'products',
        data: { tenant: tenantId, sku: 'HIDDEN', name: 'Not online', costPrice: 1, sellPrice: 5, taxRate: 0, reorderPoint: 0, maxDiscountAmount: 0 },
        overrideAccess: true,
        draft: false,
      });
      await payload.update({ collection: 'products', id: productId, data: { showOnline: true, onlineDescription: 'Soft cotton' }, overrideAccess: true });

      const { body } = await getShop('mama-baby');
      expect(body.available).toBe(true);
      expect(body.products).toHaveLength(1);
      const [item] = body.products;
      expect(item).toMatchObject({ name: 'Romper set', price: 1000, availability: 'in_stock', description: 'Soft cotton' });
      const raw = JSON.stringify(body);
      expect(raw).not.toContain('costPrice');
      expect(raw).not.toContain('"quantity"');
    });

    it('lists every active product in list-all mode except hidden ones, and keeps hand-picks when switched back', async () => {
      await enableAddon();
      await payload.update({ collection: 'tenants', id: tenantId, data: { shopSlug: 'mama-baby', storefrontEnabled: true }, overrideAccess: true });
      const second = await payload.create({
        collection: 'products',
        data: { tenant: tenantId, sku: 'BIB', name: 'Bib pack', costPrice: 100, sellPrice: 400, taxRate: 0, reorderPoint: 0, maxDiscountAmount: 0 },
        overrideAccess: true,
        draft: false,
      });
      // Hand-picked mode: only the ticked romper.
      await payload.update({ collection: 'products', id: productId, data: { showOnline: true }, overrideAccess: true });
      expect((await getShop('mama-baby')).body.products.map((p: { name: string }) => p.name)).toEqual(['Romper set']);

      // List-all mode (owner's own setting): both, including the never-ticked bib pack.
      await payload.update({ collection: 'tenants', id: tenantId, data: { storefrontListAll: true }, user: owner, overrideAccess: false });
      expect((await getShop('mama-baby')).body.products.map((p: { name: string }) => p.name).sort()).toEqual(['Bib pack', 'Romper set']);

      // Hide one - gone from the shop and the sitemap index.
      await payload.update({ collection: 'products', id: productId, data: { hideOnline: true }, user: owner, overrideAccess: false });
      expect((await getShop('mama-baby')).body.products.map((p: { name: string }) => p.name)).toEqual(['Bib pack']);
      const { GET: index } = await import('../app/api/storefront/route.ts');
      const shops = (await (await index()).json()).shops;
      expect(shops[0].products.map((p: { id: number }) => p.id)).toEqual([second.id]);

      // Back to hand-picked: the original pick is still remembered.
      await payload.update({ collection: 'tenants', id: tenantId, data: { storefrontListAll: false }, overrideAccess: true });
      await payload.update({ collection: 'products', id: productId, data: { hideOnline: false }, overrideAccess: true });
      expect((await getShop('mama-baby')).body.products.map((p: { name: string }) => p.name)).toEqual(['Romper set']);
    });

    it('serves delivery zones, free-delivery threshold and same-day settings, validating the cutoff', async () => {
      await enableAddon();
      await payload.update({
        collection: 'tenants',
        id: tenantId,
        data: {
          shopSlug: 'mama-baby',
          storefrontEnabled: true,
          deliveryZones: [
            { name: 'Nairobi CBD', fee: 200, eta: 'Same day' },
            { name: 'Upcountry', fee: 450, eta: '1-2 days' },
          ],
          freeDeliveryThreshold: 5000,
          payOnDelivery: true,
          sameDayCutoff: ' 16:00 ',
          sameDayArea: 'Nairobi',
        },
        user: owner,
        overrideAccess: false,
      });
      const { body } = await getShop('mama-baby');
      expect(body.shop.delivery).toEqual({
        zones: [
          { name: 'Nairobi CBD', fee: 200, eta: 'Same day' },
          { name: 'Upcountry', fee: 450, eta: '1-2 days' },
        ],
        freeThreshold: 5000,
        payOnDelivery: true,
        sameDayCutoff: '16:00',
        sameDayArea: 'Nairobi',
      });
      await expect(
        payload.update({ collection: 'tenants', id: tenantId, data: { sameDayCutoff: '4pm' }, user: owner, overrideAccess: false }),
      ).rejects.toThrow(/16:00/);
    });

    it('serves SEO settings and lists live, indexable shops in the sitemap index', async () => {
      await enableAddon();
      await payload.update({
        collection: 'tenants',
        id: tenantId,
        data: {
          shopSlug: 'mama-baby',
          storefrontEnabled: true,
          seoTitle: 'Baby clothes in Westlands',
          seoDescription: 'Newborn sets and gift hampers.',
          storefrontCity: 'Westlands, Nairobi',
          // Owners paste Google's whole tag - only the code is kept.
          googleSiteVerification: '<meta name="google-site-verification" content="abc123XYZ_verify-code" />',
        },
        user: owner,
        overrideAccess: false,
      });
      await payload.update({ collection: 'products', id: productId, data: { showOnline: true, seoTitle: 'Cotton romper set' }, overrideAccess: true });

      const { body } = await getShop('mama-baby');
      expect(body.shop.seo).toMatchObject({
        title: 'Baby clothes in Westlands',
        description: 'Newborn sets and gift hampers.',
        city: 'Westlands, Nairobi',
        indexable: true,
        googleSiteVerification: 'abc123XYZ_verify-code',
      });
      expect(body.products[0].seoTitle).toBe('Cotton romper set');

      const { GET } = await import('../app/api/storefront/route.ts');
      const index = await (await GET()).json();
      expect(index.shops).toEqual([expect.objectContaining({ slug: 'mama-baby', products: [expect.objectContaining({ id: productId })] })]);

      // "Hide from Google" drops it from the sitemap index but keeps the shop live.
      await payload.update({ collection: 'tenants', id: tenantId, data: { storefrontIndexable: false }, overrideAccess: true });
      expect((await (await GET()).json()).shops).toEqual([]);
      expect((await getShop('mama-baby')).body.shop.seo.indexable).toBe(false);

      await expect(
        payload.update({ collection: 'tenants', id: tenantId, data: { googleSiteVerification: 'bad code!' }, user: owner, overrideAccess: false }),
      ).rejects.toThrow(/verification/);
    });
  });

  describe('authenticated routes', () => {
    async function loginAs(email: string) {
      const result = await payload.login({ collection: 'users', data: { email, password: 'pw123456' } });
      authHeader = `JWT ${result.token}`;
    }

    it('validate previews a promo with the same rules the order uses', async () => {
      await enableAddon();
      await createPromo({ code: 'MIN3K', kind: 'flat', value: 300, minSpend: 3000 });
      await loginAs('cashier@test.local');
      const { POST } = await import('../app/api/promo-codes/validate/route.ts');
      const ask = async (subtotal: number) =>
        (await POST(new Request('http://test', { method: 'POST', body: JSON.stringify({ code: 'min3k', subtotal }) }))).json();
      expect(await ask(5000)).toMatchObject({ ok: true, discount: 300, code: 'MIN3K' });
      expect((await ask(1000)).ok).toBe(false);

      // Add-on off: the endpoint behaves as if it doesn't exist.
      await payload.update({ collection: 'tenants', id: tenantId, data: { addons: [] }, overrideAccess: true });
      const res = await POST(new Request('http://test', { method: 'POST', body: JSON.stringify({ code: 'min3k', subtotal: 5000 }) }));
      expect(res.status).toBe(404);
    });

    it('slow-movers lists stocked products with no recent sales, hiding cost from non-owners', async () => {
      const old = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
      await payload.db.drizzle.execute(`UPDATE products SET created_at = '${old}'`);
      await sell(); // Romper sold today -> not slow
      const dusty = await payload.create({
        collection: 'products',
        data: { tenant: tenantId, sku: 'DUSTY', name: 'Winter jacket', costPrice: 500, sellPrice: 1500, taxRate: 0.16, reorderPoint: 0, maxDiscountAmount: 0 },
        overrideAccess: true,
        draft: false,
      });
      await payload.db.drizzle.execute(`UPDATE products SET created_at = '${old}' WHERE id = ${dusty.id}`);
      await payload.create({
        collection: 'stock-movements',
        data: { id: crypto.randomUUID(), tenant: tenantId, store: storeId, product: dusty.id, quantityDelta: 4, reason: 'restock', clientTimestamp: old, sourceTerminal: 'seed' },
        overrideAccess: true,
      });

      const { GET } = await import('../app/api/reports/slow-movers/route.ts');
      await loginAs('cashier@test.local');
      const asCashier = await (await GET(new Request('http://test/api/reports/slow-movers?days=60'))).json();
      expect(asCashier.items.map((i: { name: string }) => i.name)).toEqual(['Winter jacket']);
      expect(asCashier.items[0]).toMatchObject({ quantity: 4, retailValue: 6000, costValue: null, lastSoldAt: null });

      await loginAs('owner@test.local');
      const asOwner = await (await GET(new Request('http://test/api/reports/slow-movers?days=60'))).json();
      expect(asOwner.items[0].costValue).toBe(2000);
    });
  });
});
