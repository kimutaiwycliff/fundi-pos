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
