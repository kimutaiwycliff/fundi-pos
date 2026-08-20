import type { CollectionConfig } from 'payload';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';

export const StoreProductOverrides: CollectionConfig = {
  slug: 'store-product-overrides',
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
    { name: 'product', type: 'relationship', relationTo: 'products', required: true, index: true },
    { name: 'priceOverride', type: 'number', admin: { step: 0.01 } },
    { name: 'isAvailable', type: 'checkbox', defaultValue: true },
  ],
};
