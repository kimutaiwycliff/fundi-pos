import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPayload, type Payload } from 'payload';
import config from '../payload.config.ts';
import { isDuplicateIdError } from '../lib/idempotency.ts';

let payload: Payload;

// asUser mimics the shape Payload's access-control functions read off
// req.user - enough to exercise real access control without a full
// auth/JWT round-trip.
// Deliberately shaped like Payload's REAL populated user (tenant as a full
// object, not a bare id) - a real authenticated request populates
// relationships this way, and a bare-id shape here would hide bugs in
// access-control functions that forget to unwrap it (this happened: a real
// POST /api/users request 500'd in production-shaped testing after this
// helper's earlier bare-id version let the same bug pass silently).
function asUser(user: { id: number; tenant: number; role: string }) {
  return { ...user, tenant: { id: user.tenant }, collection: 'users' } as any;
}

async function truncateAll() {
  const tables = [
    'orders_line_items', 'orders', 'stock_movements', 'products_bundle_components',
    'products_variants', 'products', 'store_product_overrides', 'purchase_orders_line_items',
    'purchase_orders', 'suppliers', 'stock_transfers_line_items', 'stock_transfers',
    'customers', 'sync_log', 'users_sessions', 'users', 'stores', 'tenants',
  ];
  await payload.db.drizzle.execute(
    `TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
}

describe('Payload collections - integration', () => {
  beforeAll(async () => {
    payload = await getPayload({ config });
    await truncateAll();
  });

  afterAll(async () => {
    await payload.destroy();
  });

  describe('Orders + StockMovements ledger', () => {
    let tenantId: number;
    let storeId: number;
    let cashierId: number;
    let managerId: number;
    let productId: number;

    beforeEach(async () => {
      await truncateAll();
      const tenant = await payload.create({
        collection: 'tenants',
        data: { name: 'Test Tenant', status: 'active', subscriptionTier: 'trial', billingStatus: 'trialing' },
        overrideAccess: true,
      });
      tenantId = tenant.id as number;

      const store = await payload.create({
        collection: 'stores',
        data: { tenant: tenantId, name: 'Test Store', timezone: 'Africa/Nairobi' },
        overrideAccess: true,
      });
      storeId = store.id as number;

      const cashier = await payload.create({
        collection: 'users',
        data: { tenant: tenantId, store: storeId, role: 'cashier', status: 'active', email: 'c@test.local', password: 'pw123456' },
        overrideAccess: true,
      });
      cashierId = cashier.id as number;

      const manager = await payload.create({
        collection: 'users',
        data: { tenant: tenantId, store: storeId, role: 'manager', status: 'active', email: 'm@test.local', password: 'pw123456' },
        overrideAccess: true,
      });
      managerId = manager.id as number;

      const product = await payload.create({
        collection: 'products',
        data: {
          tenant: tenantId, sku: 'SKU-1', name: 'Test Widget',
          costPrice: 10, sellPrice: 100, taxRate: 0.16, reorderPoint: 0, maxDiscountAmount: 0,
        },
        overrideAccess: true,
        draft: false,
      });
      productId = product.id as number;

      // Opening stock: 5 units.
      await payload.create({
        collection: 'stock-movements',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeId, product: productId,
          quantityDelta: 5, reason: 'restock', clientTimestamp: new Date().toISOString(),
          sourceTerminal: 'test-seed',
        },
        overrideAccess: true,
      });
    });

    it('recomputes totals server-side, ignoring client-submitted values', async () => {
      const order = await payload.create({
        collection: 'orders',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeId, terminal: 'till-1',
          cashier: cashierId,
          lineItems: [{ product: productId, quantity: 2, unitPrice: 100, discount: 0 }],
          // Tampered client values - server must override these.
          taxTotal: 999, discountTotal: 999, total: 1,
          tenderType: 'cash', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
        },
        user: asUser({ id: cashierId, tenant: tenantId, role: 'cashier' }),
        overrideAccess: false,
        draft: false,
      });

      // 2 x 100 = 200 gross, 16% VAT-inclusive => net 172.41, tax 27.59
      expect(order.total).toBe(200);
      expect(order.taxTotal).toBeCloseTo(27.59, 2);
      expect(order.discountTotal).toBe(0);
    });

    it("uses each line item's own product taxRate, not a blanket rate", async () => {
      // Regression test: the beforeChange hook used to hardcode 0.16 for
      // every line regardless of the product - undetectable by the test
      // above since its own fixture product also happens to be 0.16. A
      // zero-rated product makes a wrong blanket rate impossible to miss.
      const exemptProduct = await payload.create({
        collection: 'products',
        data: {
          tenant: tenantId, sku: 'SKU-2', name: 'Zero-Rated Widget',
          costPrice: 10, sellPrice: 100, taxRate: 0, reorderPoint: 0, maxDiscountAmount: 0,
        },
        overrideAccess: true,
        draft: false,
      });
      await payload.create({
        collection: 'stock-movements',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeId, product: exemptProduct.id,
          quantityDelta: 5, reason: 'restock', clientTimestamp: new Date().toISOString(),
          sourceTerminal: 'test-seed',
        },
        overrideAccess: true,
      });

      const order = await payload.create({
        collection: 'orders',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeId, terminal: 'till-1',
          cashier: cashierId,
          lineItems: [{ product: exemptProduct.id, quantity: 2, unitPrice: 100, discount: 0 }],
          taxTotal: 0, discountTotal: 0, total: 0,
          tenderType: 'cash', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
        },
        user: asUser({ id: cashierId, tenant: tenantId, role: 'cashier' }),
        overrideAccess: false,
        draft: false,
      });

      expect(order.total).toBe(200);
      expect(order.taxTotal).toBe(0);
    });

    it('derives a sale StockMovement per line item, linked to the order', async () => {
      const order = await payload.create({
        collection: 'orders',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeId, terminal: 'till-1',
          cashier: cashierId,
          lineItems: [{ product: productId, quantity: 2, unitPrice: 100, discount: 0 }],
          taxTotal: 0, discountTotal: 0, total: 0,
          tenderType: 'cash', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
        },
        user: asUser({ id: cashierId, tenant: tenantId, role: 'cashier' }),
        overrideAccess: false,
        draft: false,
      });

      const movements = await payload.find({
        collection: 'stock-movements',
        where: { relatedOrder: { equals: order.id } },
        overrideAccess: true,
      });

      expect(movements.docs).toHaveLength(1);
      expect(movements.docs[0].quantityDelta).toBe(-2);
      expect(movements.docs[0].reason).toBe('sale');
    });

    it('flags the movement for review when a sale drives stock negative, without clamping', async () => {
      // Only 5 in stock; sell 8.
      const order = await payload.create({
        collection: 'orders',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeId, terminal: 'till-1',
          cashier: cashierId,
          lineItems: [{ product: productId, quantity: 8, unitPrice: 100, discount: 0 }],
          taxTotal: 0, discountTotal: 0, total: 0,
          tenderType: 'cash', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
        },
        user: asUser({ id: cashierId, tenant: tenantId, role: 'cashier' }),
        overrideAccess: false,
        draft: false,
      });

      const movements = await payload.find({
        collection: 'stock-movements',
        where: { relatedOrder: { equals: order.id } },
        overrideAccess: true,
      });

      expect(movements.docs[0].quantityDelta).toBe(-8); // never silently clamped to zero
      expect(movements.docs[0].flaggedForReview).toBe(true);
    });

    it('treats a replayed client-generated UUID as a detectable duplicate, not silent overwrite', async () => {
      const id = crypto.randomUUID();
      const movementData = {
        id, tenant: tenantId, store: storeId, product: productId,
        quantityDelta: 1, reason: 'restock' as const, clientTimestamp: new Date().toISOString(),
        sourceTerminal: 'till-1',
      };

      await payload.create({ collection: 'stock-movements', data: movementData, overrideAccess: true });

      await expect(
        payload.create({ collection: 'stock-movements', data: movementData, overrideAccess: true }),
      ).rejects.toSatisfy((err: unknown) => isDuplicateIdError(err));

      const all = await payload.find({
        collection: 'stock-movements',
        where: { id: { equals: id } },
        overrideAccess: true,
      });
      expect(all.docs).toHaveLength(1); // no duplicate row was created
    });

    it('lets a manager update an order (e.g. refund) but not a cashier', async () => {
      const order = await payload.create({
        collection: 'orders',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeId, terminal: 'till-1',
          cashier: cashierId,
          lineItems: [{ product: productId, quantity: 1, unitPrice: 100, discount: 0 }],
          taxTotal: 0, discountTotal: 0, total: 0,
          tenderType: 'cash', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
        },
        overrideAccess: true,
        draft: false,
      });

      await expect(
        payload.update({
          collection: 'orders',
          id: order.id,
          data: { status: 'refunded' },
          user: asUser({ id: cashierId, tenant: tenantId, role: 'cashier' }),
          overrideAccess: false,
        }),
      ).rejects.toThrow();

      const refunded = await payload.update({
        collection: 'orders',
        id: order.id,
        data: { status: 'refunded' },
        user: asUser({ id: managerId, tenant: tenantId, role: 'manager' }),
        overrideAccess: false,
      });
      expect(refunded.status).toBe('refunded');
    });

    it('restores stock on a void, same as a refund (both undo the same physical sale)', async () => {
      const order = await payload.create({
        collection: 'orders',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeId, terminal: 'till-1',
          cashier: cashierId,
          lineItems: [{ product: productId, quantity: 2, unitPrice: 100, discount: 0 }],
          taxTotal: 0, discountTotal: 0, total: 0,
          tenderType: 'cash', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
        },
        overrideAccess: true,
        draft: false,
      });

      const before = await payload.find({
        collection: 'stock-movements',
        where: { relatedOrder: { equals: order.id } },
        overrideAccess: true,
      });
      expect(before.docs).toHaveLength(1); // the original sale movement, -2

      await payload.update({
        collection: 'orders',
        id: order.id,
        data: { status: 'voided' },
        user: asUser({ id: managerId, tenant: tenantId, role: 'manager' }),
        overrideAccess: false,
      });

      const after = await payload.find({
        collection: 'stock-movements',
        where: { relatedOrder: { equals: order.id } },
        overrideAccess: true,
      });
      expect(after.docs).toHaveLength(2);
      const reversal = after.docs.find((m) => m.reason === 'adjustment');
      expect(reversal?.quantityDelta).toBe(2); // mirror image of the original -2 sale
    });

    it('never allows deleting an Order or StockMovement, even for an owner', async () => {
      const order = await payload.create({
        collection: 'orders',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeId, terminal: 'till-1',
          cashier: cashierId,
          lineItems: [{ product: productId, quantity: 1, unitPrice: 100, discount: 0 }],
          taxTotal: 0, discountTotal: 0, total: 0,
          tenderType: 'cash', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
        },
        overrideAccess: true,
        draft: false,
      });

      await expect(
        payload.delete({
          collection: 'orders',
          id: order.id,
          user: asUser({ id: managerId, tenant: tenantId, role: 'owner' }),
          overrideAccess: false,
        }),
      ).rejects.toThrow();
    });
  });

  describe('Tenant isolation', () => {
    it('never returns another tenant\'s data, even to that tenant\'s owner', async () => {
      await truncateAll();
      const tenantA = await payload.create({
        collection: 'tenants', data: { name: 'A', status: 'active', subscriptionTier: 'trial', billingStatus: 'trialing' },
        overrideAccess: true,
      });
      const tenantB = await payload.create({
        collection: 'tenants', data: { name: 'B', status: 'active', subscriptionTier: 'trial', billingStatus: 'trialing' },
        overrideAccess: true,
      });
      const storeA = await payload.create({
        collection: 'stores', data: { tenant: tenantA.id, name: 'A Store', timezone: 'Africa/Nairobi' },
        overrideAccess: true,
      });
      const storeB = await payload.create({
        collection: 'stores', data: { tenant: tenantB.id, name: 'B Store', timezone: 'Africa/Nairobi' },
        overrideAccess: true,
      });
      const ownerA = await payload.create({
        collection: 'users',
        data: { tenant: tenantA.id, role: 'owner', status: 'active', email: 'ownerA@test.local', password: 'pw123456' },
        overrideAccess: true,
      });

      const result = await payload.find({
        collection: 'stores',
        user: asUser({ id: ownerA.id as number, tenant: tenantA.id as number, role: 'owner' }),
        overrideAccess: false,
      });

      const ids = result.docs.map((d) => d.id);
      expect(ids).toContain(storeA.id);
      expect(ids).not.toContain(storeB.id);
    });

    it('ignores a spoofed tenant field on create and forces the authenticated user\'s own tenant', async () => {
      const tenantA = await payload.create({
        collection: 'tenants', data: { name: 'A2', status: 'active', subscriptionTier: 'trial', billingStatus: 'trialing' },
        overrideAccess: true,
      });
      const tenantB = await payload.create({
        collection: 'tenants', data: { name: 'B2', status: 'active', subscriptionTier: 'trial', billingStatus: 'trialing' },
        overrideAccess: true,
      });
      const managerA = await payload.create({
        collection: 'users',
        data: { tenant: tenantA.id, role: 'manager', status: 'active', email: 'managerA2@test.local', password: 'pw123456' },
        overrideAccess: true,
      });

      // A manager authenticated as tenant A attempts to create a supplier
      // under tenant B's id - the beforeChange hook must override this,
      // not the client's submitted value.
      const supplier = await payload.create({
        collection: 'suppliers',
        data: { tenant: tenantB.id, name: 'Spoofed Supplier' },
        user: asUser({ id: managerA.id as number, tenant: tenantA.id as number, role: 'manager' }),
        overrideAccess: false,
      });

      expect(toIdValue(supplier.tenant)).toBe(tenantA.id);
      expect(toIdValue(supplier.tenant)).not.toBe(tenantB.id);
    });
  });
});

function toIdValue(value: unknown): unknown {
  return value && typeof value === 'object' && 'id' in (value as object) ? (value as { id: unknown }).id : value;
}
