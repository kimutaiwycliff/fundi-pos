import type { CollectionConfig } from 'payload';
import { isAuthenticated, ownTenantOnly } from '../access/index.ts';

export const Customers: CollectionConfig = {
  slug: 'customers',
  admin: { useAsTitle: 'name' },
  access: {
    read: ownTenantOnly,
    // Any authenticated tenant user (incl. cashiers) can register/update a
    // customer profile at checkout time for loyalty tracking.
    create: isAuthenticated,
    update: ownTenantOnly,
    delete: () => false,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'phone', type: 'text', index: true },
    { name: 'loyaltyPoints', type: 'number', required: true, defaultValue: 0 },
  ],
};
