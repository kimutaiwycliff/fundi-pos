import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPayload, type Payload } from 'payload';
import config from '../payload.config.ts';

let payload: Payload;

function asUser(user: { id: number; tenant: number; role: string; store?: number | null }) {
  return {
    id: user.id,
    role: user.role,
    tenant: { id: user.tenant },
    store: user.store != null ? { id: user.store } : null,
    collection: 'users',
  } as any;
}

function idOf(value: unknown): unknown {
  return value && typeof value === 'object' && 'id' in (value as object) ? (value as { id: unknown }).id : value;
}

async function truncateAll() {
  const tables = [
    'orders_line_items', 'orders', 'stock_movements', 'products_bundle_components',
    'products_variants', 'products', 'store_product_overrides', 'purchase_orders_line_items',
    'purchase_orders', 'suppliers', 'stock_transfers_line_items', 'stock_transfers',
    'customers', 'sync_log', 'shifts', 'users_sessions', 'users', 'stores', 'tenants',
  ];
  await payload.db.drizzle.execute(
    `TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
}

describe('Phase 6 - StockTransfers receiving + Shifts cash-up', () => {
  let tenantId: number;
  let storeA: number;
  let storeB: number;
  let cashierId: number;
  let managerId: number;
  let productId: number;

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  afterAll(async () => {
    await payload.destroy();
  });

  beforeEach(async () => {
    await truncateAll();
    const tenant = await payload.create({
      collection: 'tenants', data: { name: 'T', subscriptionTier: 'trial', billingStatus: 'trialing' },
      overrideAccess: true,
    });
    tenantId = tenant.id as number;

    const sA = await payload.create({
      collection: 'stores', data: { tenant: tenantId, name: 'A', timezone: 'Africa/Nairobi' }, overrideAccess: true,
    });
    storeA = sA.id as number;
    const sB = await payload.create({
      collection: 'stores', data: { tenant: tenantId, name: 'B', timezone: 'Africa/Nairobi' }, overrideAccess: true,
    });
    storeB = sB.id as number;

    const cashier = await payload.create({
      collection: 'users',
      data: { tenant: tenantId, store: storeA, role: 'cashier', email: 'c@test.local', password: 'pw123456' },
      overrideAccess: true,
    });
    cashierId = cashier.id as number;

    const manager = await payload.create({
      collection: 'users',
      data: { tenant: tenantId, store: storeA, role: 'manager', email: 'm@test.local', password: 'pw123456' },
      overrideAccess: true,
    });
    managerId = manager.id as number;

    const product = await payload.create({
      collection: 'products',
      data: { tenant: tenantId, sku: 'SKU-X', name: 'Widget', costPrice: 10, sellPrice: 100, taxRate: 0.16, reorderPoint: 0, maxDiscountPercent: 0 },
      overrideAccess: true,
      draft: false,
    });
    productId = product.id as number;

    await payload.create({
      collection: 'stock-movements',
      data: {
        id: crypto.randomUUID(), tenant: tenantId, store: storeA, product: productId,
        quantityDelta: 10, reason: 'restock', clientTimestamp: new Date().toISOString(), sourceTerminal: 'seed',
      },
      overrideAccess: true,
    });
  });

  describe('StockTransfers', () => {
    it('only moves stock once a transfer is marked received, deriving matched transfer_out/transfer_in rows', async () => {
      const transfer = await payload.create({
        collection: 'stock-transfers',
        data: {
          tenant: tenantId, fromStore: storeA, toStore: storeB,
          lineItems: [{ product: productId, quantity: 4 }],
          status: 'draft',
        },
        overrideAccess: true,
      });

      let movements = await payload.find({
        collection: 'stock-movements',
        where: { reason: { in: ['transfer_out', 'transfer_in'] } },
        overrideAccess: true,
      });
      expect(movements.docs).toHaveLength(0); // draft - nothing moved yet

      await payload.update({
        collection: 'stock-transfers', id: transfer.id, data: { status: 'in_transit' }, overrideAccess: true,
      });
      movements = await payload.find({
        collection: 'stock-movements',
        where: { reason: { in: ['transfer_out', 'transfer_in'] } },
        overrideAccess: true,
      });
      expect(movements.docs).toHaveLength(0); // in_transit still - not received yet

      await payload.update({
        collection: 'stock-transfers', id: transfer.id, data: { status: 'received' }, overrideAccess: true,
      });
      movements = await payload.find({
        collection: 'stock-movements',
        where: { reason: { in: ['transfer_out', 'transfer_in'] } },
        overrideAccess: true,
      });
      expect(movements.docs).toHaveLength(2);
      const out = movements.docs.find((m) => m.reason === 'transfer_out')!;
      const inn = movements.docs.find((m) => m.reason === 'transfer_in')!;
      expect(idOf(out.store)).toBe(storeA);
      expect(out.quantityDelta).toBe(-4);
      expect(idOf(inn.store)).toBe(storeB);
      expect(inn.quantityDelta).toBe(4);
    });

    it('does not double-move stock if received is set again (idempotent against re-saves)', async () => {
      const transfer = await payload.create({
        collection: 'stock-transfers',
        data: {
          tenant: tenantId, fromStore: storeA, toStore: storeB,
          lineItems: [{ product: productId, quantity: 1 }], status: 'received',
        },
        overrideAccess: true,
      });
      // Saving again while already 'received' (e.g. editing an unrelated
      // field) must not re-fire the transfer - previousDoc.status is
      // already 'received' on this second save.
      await payload.update({
        collection: 'stock-transfers', id: transfer.id, data: { status: 'received' }, overrideAccess: true,
      });

      const movements = await payload.find({
        collection: 'stock-movements',
        where: { reason: { in: ['transfer_out', 'transfer_in'] } },
        overrideAccess: true,
      });
      expect(movements.docs).toHaveLength(2);
    });
  });

  describe('Shifts cash-up reconciliation', () => {
    it('computes expectedCash and variance from real cash orders, ignoring client-submitted values', async () => {
      const shift = await payload.create({
        collection: 'shifts',
        data: {
          tenant: tenantId, store: storeA, terminal: 'till-1', cashier: cashierId,
          openedAt: new Date().toISOString(), openingFloat: 500, status: 'open',
        },
        user: asUser({ id: cashierId, tenant: tenantId, role: 'cashier', store: storeA }),
        overrideAccess: false,
        draft: false,
      });

      // Two cash sales and one card sale during the shift - only cash counts.
      await payload.create({
        collection: 'orders',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeA, terminal: 'till-1', cashier: cashierId,
          lineItems: [{ product: productId, quantity: 1, unitPrice: 100, discount: 0 }],
          taxTotal: 0, discountTotal: 0, total: 0, tenderType: 'cash', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
        },
        overrideAccess: true,
        draft: false,
      });
      await payload.create({
        collection: 'orders',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeA, terminal: 'till-1', cashier: cashierId,
          lineItems: [{ product: productId, quantity: 1, unitPrice: 100, discount: 0 }],
          taxTotal: 0, discountTotal: 0, total: 0, tenderType: 'cash', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
        },
        overrideAccess: true,
        draft: false,
      });
      await payload.create({
        collection: 'orders',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeA, terminal: 'till-1', cashier: cashierId,
          lineItems: [{ product: productId, quantity: 1, unitPrice: 100, discount: 0 }],
          taxTotal: 0, discountTotal: 0, total: 0, tenderType: 'card', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
        },
        overrideAccess: true,
        draft: false,
      });

      // Cashier closes, claiming a bogus expectedCash/variance - server must
      // overwrite both from the real ledger, not trust the client.
      const closed = await payload.update({
        collection: 'shifts',
        id: shift.id,
        data: { status: 'closed', closingCashCounted: 690, expectedCash: 999999, variance: -1 },
        user: asUser({ id: cashierId, tenant: tenantId, role: 'cashier', store: storeA }),
        overrideAccess: false,
      });

      // openingFloat 500 + two cash sales @ 100 each = 700 expected.
      expect(closed.expectedCash).toBe(700);
      expect(closed.variance).toBe(-10); // 690 counted - 700 expected
    });

    it('lets a cashier close only their own shift, not a colleague\'s', async () => {
      const otherCashier = await payload.create({
        collection: 'users',
        data: { tenant: tenantId, store: storeA, role: 'cashier', email: 'c2@test.local', password: 'pw123456' },
        overrideAccess: true,
      });

      const shift = await payload.create({
        collection: 'shifts',
        data: {
          tenant: tenantId, store: storeA, terminal: 'till-1', cashier: cashierId,
          openedAt: new Date().toISOString(), openingFloat: 0, status: 'open',
        },
        overrideAccess: true,
        draft: false,
      });

      await expect(
        payload.update({
          collection: 'shifts', id: shift.id, data: { status: 'closed', closingCashCounted: 0 },
          user: asUser({ id: otherCashier.id as number, tenant: tenantId, role: 'cashier', store: storeA }),
          overrideAccess: false,
        }),
      ).rejects.toThrow();

      const closed = await payload.update({
        collection: 'shifts', id: shift.id, data: { status: 'closed', closingCashCounted: 0 },
        user: asUser({ id: cashierId, tenant: tenantId, role: 'cashier', store: storeA }),
        overrideAccess: false,
      });
      expect(closed.status).toBe('closed');
    });
  });

  describe('Customer loyalty points', () => {
    it('earns 1 point per 100 spent on a completed sale tied to a customer, and reverses on void', async () => {
      const customer = await payload.create({
        collection: 'customers',
        data: { tenant: tenantId, name: 'Jane', phone: '0700000000', loyaltyPoints: 5 },
        overrideAccess: true,
      });

      const order = await payload.create({
        collection: 'orders',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeA, terminal: 'till-1', cashier: cashierId,
          customer: customer.id,
          lineItems: [{ product: productId, quantity: 3, unitPrice: 100, discount: 0 }],
          taxTotal: 0, discountTotal: 0, total: 0, tenderType: 'cash', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
        },
        overrideAccess: true,
        draft: false,
      });
      expect(order.loyaltyPointsEarned).toBe(3); // 300 total / 100

      const afterSale = await payload.findByID({ collection: 'customers', id: customer.id, overrideAccess: true });
      expect(afterSale.loyaltyPoints).toBe(8); // 5 + 3

      await payload.update({
        collection: 'orders', id: order.id, data: { status: 'voided' },
        user: asUser({ id: managerId, tenant: tenantId, role: 'manager' }), overrideAccess: false,
      });

      const afterVoid = await payload.findByID({ collection: 'customers', id: customer.id, overrideAccess: true });
      expect(afterVoid.loyaltyPoints).toBe(5); // back to where it started
    });

    it('never accrues points for a sale with no attached customer', async () => {
      const order = await payload.create({
        collection: 'orders',
        data: {
          id: crypto.randomUUID(), tenant: tenantId, store: storeA, terminal: 'till-1', cashier: cashierId,
          lineItems: [{ product: productId, quantity: 3, unitPrice: 100, discount: 0 }],
          taxTotal: 0, discountTotal: 0, total: 0, tenderType: 'cash', paymentStatus: 'paid', status: 'completed', kraSubmissionStatus: 'not_applicable',
        },
        overrideAccess: true,
        draft: false,
      });
      expect(order.loyaltyPointsEarned).toBe(0);
    });
  });
});
