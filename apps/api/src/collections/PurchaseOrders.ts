import type { Access, CollectionConfig } from 'payload';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';
import { isTenantUser, toID } from '../lib/relations.ts';

// Only a still-draft list is safe to delete outright - once it's been sent
// or (partially) received, deleting it would silently orphan whatever
// stock-movements the receive route already wrote against it. Same
// tenant/role check as managerOrOwner, with status: draft ANDed in via the
// same returned Where object.
const deleteDraftOnly: Access = ({ req }) => {
  if (!req.user) return false;
  if (!isTenantUser(req.user)) return true;
  if (req.user.role !== 'owner' && req.user.role !== 'manager') return false;
  return { tenant: { equals: toID(req.user.tenant) }, status: { equals: 'draft' } };
};

export const PurchaseOrders: CollectionConfig = {
  slug: 'purchase-orders',
  admin: { useAsTitle: 'id' },
  access: {
    read: ownTenantOnly,
    create: managerOrOwner,
    update: managerOrOwner,
    delete: deleteDraftOnly,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'store', type: 'relationship', relationTo: 'stores', required: true, index: true },
    { name: 'supplier', type: 'relationship', relationTo: 'suppliers', required: true },
    {
      name: 'lineItems',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'product', type: 'relationship', relationTo: 'products', required: true },
        // Sub-document id within product.variants, same convention as
        // StockMovements.ts's own `variant` field - stock is always tracked
        // per (product, variant), never blended, so a line item restocking
        // a specific variant has to be able to say which one.
        { name: 'variant', type: 'text' },
        { name: 'quantity', type: 'number', required: true, min: 0.001 },
        { name: 'unitCost', type: 'number', required: true, admin: { step: 0.01 } },
        // How much of this line has actually been received so far - lets a
        // short delivery be receive()'d again later for the remainder,
        // rather than the whole PO being all-or-nothing.
        { name: 'receivedQuantity', type: 'number', required: true, defaultValue: 0, min: 0 },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ['draft', 'sent', 'partially_received', 'received'],
    },
    { name: 'receivedAt', type: 'date' },
  ],
  hooks: {
    beforeChange: [enforceOwnTenant({ requireOwnStore: true })],
  },
};
