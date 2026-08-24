import type { CollectionConfig, Where } from 'payload';
import { roundCurrency } from '@hardware-pos/business-logic';
import { isAuthenticated, managerOrOwner } from '../access/index.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';
import { toID } from '../lib/relations.ts';

export const Shifts: CollectionConfig = {
  slug: 'shifts',
  admin: { useAsTitle: 'id', defaultColumns: ['store', 'cashier', 'status', 'variance'] },
  access: {
    read: ({ req }): boolean | Where => {
      if (req.user?.collection === 'platform-admins') return true;
      if (!req.user) return false;
      if (req.user.role === 'owner' || req.user.role === 'manager') {
        return { tenant: { equals: toID(req.user.tenant) } };
      }
      // Cashiers only ever see their own shifts.
      return { tenant: { equals: toID(req.user.tenant) }, cashier: { equals: toID(req.user.id) } };
    },
    create: isAuthenticated, // a cashier opens their own shift
    update: ({ req }): boolean | Where => {
      if (req.user?.collection === 'platform-admins') return true;
      if (!req.user) return false;
      if (req.user.role === 'owner' || req.user.role === 'manager') {
        return { tenant: { equals: toID(req.user.tenant) } };
      }
      // A cashier may only close their own shift, not anyone else's.
      return { tenant: { equals: toID(req.user.tenant) }, cashier: { equals: toID(req.user.id) } };
    },
    delete: managerOrOwner,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'store', type: 'relationship', relationTo: 'stores', required: true, index: true },
    { name: 'terminal', type: 'text', required: true },
    { name: 'cashier', type: 'relationship', relationTo: 'users', required: true },
    { name: 'openedAt', type: 'date', required: true },
    { name: 'openingFloat', type: 'number', required: true, defaultValue: 0, admin: { step: 0.01 } },
    { name: 'closedAt', type: 'date' },
    { name: 'closingCashCounted', type: 'number', admin: { step: 0.01 } },
    {
      name: 'expectedCash',
      type: 'number',
      admin: { readOnly: true, step: 0.01, description: 'openingFloat + all cash sales during this shift (server-computed on close).' },
    },
    {
      name: 'variance',
      type: 'number',
      admin: { readOnly: true, step: 0.01, description: 'closingCashCounted - expectedCash. Never auto-corrected - a manager reviews any non-zero variance.' },
    },
    { name: 'status', type: 'select', required: true, defaultValue: 'open', options: ['open', 'closed'] },
  ],
  hooks: {
    beforeChange: [
      enforceOwnTenant({ requireOwnStore: true }),
      ({ data, operation }) => {
        if (operation === 'create' && !data.openedAt) {
          data.openedAt = new Date().toISOString();
        }
        return data;
      },
      // Cash-up reconciliation: computed server-side from the actual Orders
      // ledger, never trusted from the client, so a cashier can't just type
      // in whatever variance makes their count look clean.
      async ({ data, operation, originalDoc, req }) => {
        const closingNow = data.status === 'closed' && originalDoc?.status !== 'closed';
        if (operation !== 'update' || !closingNow) return data;

        data.closedAt = data.closedAt || new Date().toISOString();

        const storeId = toID(data.store ?? originalDoc?.store);
        const terminal = data.terminal ?? originalDoc?.terminal;
        const openedAt = originalDoc?.openedAt ?? data.openedAt;

        const cashOrders = await req.payload.find({
          collection: 'orders',
          where: {
            store: { equals: storeId },
            terminal: { equals: terminal },
            tenderType: { equals: 'cash' },
            status: { equals: 'completed' },
            createdAt: { greater_than_equal: openedAt },
          },
          pagination: false,
          overrideAccess: true,
          req,
        });

        const cashSales = cashOrders.docs.reduce((sum, order) => sum + (order.total as number), 0);
        const openingFloat = (data.openingFloat ?? originalDoc?.openingFloat ?? 0) as number;
        data.expectedCash = roundCurrency(openingFloat + cashSales);

        if (typeof data.closingCashCounted === 'number') {
          data.variance = roundCurrency(data.closingCashCounted - data.expectedCash);
        }

        return data;
      },
    ],
  },
};
