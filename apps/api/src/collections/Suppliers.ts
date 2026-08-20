import type { CollectionConfig } from 'payload';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';

export const Suppliers: CollectionConfig = {
  slug: 'suppliers',
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
    { name: 'contactInfo', type: 'text' },
  ],
};
