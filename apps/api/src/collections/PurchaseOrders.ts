import type { CollectionConfig } from 'payload';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';

export const PurchaseOrders: CollectionConfig = {
  slug: 'purchase-orders',
  admin: { useAsTitle: 'id' },
  access: {
    read: ownTenantOnly,
    create: managerOrOwner,
    update: managerOrOwner,
    delete: managerOrOwner,
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
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ['draft', 'sent', 'received'],
    },
    { name: 'receivedAt', type: 'date' },
  ],
  hooks: {
    beforeChange: [enforceOwnTenant({ requireOwnStore: true })],
  },
};
