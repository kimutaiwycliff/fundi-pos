import type { CollectionConfig } from 'payload';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';

export const Products: CollectionConfig = {
  slug: 'products',
  admin: { useAsTitle: 'name' },
  access: {
    read: ownTenantOnly,
    create: managerOrOwner,
    update: managerOrOwner,
    delete: managerOrOwner,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'sku', type: 'text', required: true, index: true },
    { name: 'barcode', type: 'text', index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'category', type: 'text' },
    {
      name: 'variants',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true }, // e.g. "Red / L"
        { name: 'sku', type: 'text', required: true },
        { name: 'barcode', type: 'text' },
      ],
    },
    { name: 'costPrice', type: 'number', required: true, defaultValue: 0, admin: { step: 0.01 } },
    { name: 'sellPrice', type: 'number', required: true, defaultValue: 0, admin: { step: 0.01 } },
    { name: 'taxRate', type: 'number', required: true, defaultValue: 0.16, admin: { step: 0.01 } },
    { name: 'isBundle', type: 'checkbox', defaultValue: false },
    {
      name: 'bundleComponents',
      type: 'array',
      admin: { condition: (data) => Boolean(data?.isBundle) },
      fields: [
        { name: 'product', type: 'relationship', relationTo: 'products', required: true },
        { name: 'quantity', type: 'number', required: true, defaultValue: 1 },
      ],
    },
  ],
};
