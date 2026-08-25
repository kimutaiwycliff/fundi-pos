import type { CollectionConfig } from 'payload';
import { APIError } from 'payload';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';
import { toID } from '../lib/relations.ts';

export const Stores: CollectionConfig = {
  slug: 'stores',
  admin: { useAsTitle: 'name' },
  access: {
    read: ownTenantOnly,
    create: managerOrOwner,
    update: managerOrOwner,
    delete: managerOrOwner,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'address', type: 'text' },
    { name: 'timezone', type: 'text', required: true, defaultValue: 'Africa/Nairobi' },
  ],
  hooks: {
    beforeChange: [enforceOwnTenant()],
    afterChange: [
      async ({ req, doc, operation }) => {
        if (!req.user || operation !== 'create') return doc;
        await req.payload.create({
          collection: 'audit-log',
          overrideAccess: true,
          data: {
            tenant: Number(toID(doc.tenant)),
            actor: Number(req.user.id),
            action: 'store_created',
            entityType: 'store',
            entityId: String(doc.id),
            summary: `Branch "${doc.name}" created`,
          },
          req,
        });
        return doc;
      },
    ],
    beforeDelete: [
      // Same reasoning as Users.ts's own delete guard: staff, sales, stock
      // and transfer history all hold required relationships to a store,
      // so Postgres's own foreign-key constraint would otherwise reject the
      // delete with a generic, unhelpful error. Checking first turns that
      // into an actionable message instead of a dead end.
      async ({ req, id }) => {
        const [users, orders, stockMovements, overrides, shifts, purchaseOrders, transfersFrom, transfersTo] =
          await Promise.all([
            req.payload.find({ collection: 'users', where: { store: { equals: id } }, limit: 1, overrideAccess: true }),
            req.payload.find({ collection: 'orders', where: { store: { equals: id } }, limit: 1, overrideAccess: true }),
            req.payload.find({ collection: 'stock-movements', where: { store: { equals: id } }, limit: 1, overrideAccess: true }),
            req.payload.find({ collection: 'store-product-overrides', where: { store: { equals: id } }, limit: 1, overrideAccess: true }),
            req.payload.find({ collection: 'shifts', where: { store: { equals: id } }, limit: 1, overrideAccess: true }),
            req.payload.find({ collection: 'purchase-orders', where: { store: { equals: id } }, limit: 1, overrideAccess: true }),
            req.payload.find({ collection: 'stock-transfers', where: { fromStore: { equals: id } }, limit: 1, overrideAccess: true }),
            req.payload.find({ collection: 'stock-transfers', where: { toStore: { equals: id } }, limit: 1, overrideAccess: true }),
          ]);
        const hasHistory = [users, orders, stockMovements, overrides, shifts, purchaseOrders, transfersFrom, transfersTo].some(
          (r) => r.totalDocs > 0,
        );
        if (hasHistory) {
          throw new APIError(
            'This branch has staff, sales, or stock history and cannot be deleted. Reassign or remove that data first.',
            400,
          );
        }
      },
    ],
    afterDelete: [
      async ({ req, doc }) => {
        if (!req.user) return;
        await req.payload.create({
          collection: 'audit-log',
          overrideAccess: true,
          data: {
            tenant: Number(toID(doc.tenant)),
            actor: Number(req.user.id),
            action: 'store_deleted',
            entityType: 'store',
            entityId: String(doc.id),
            summary: `Branch "${doc.name}" deleted`,
          },
          req,
        });
      },
    ],
  },
};
