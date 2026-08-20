import type { CollectionConfig } from 'payload';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';
import { hashPin } from '../lib/pin.ts';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true, // email/password login, for the web dashboard
  admin: { useAsTitle: 'email' },
  access: {
    read: ownTenantOnly,
    create: managerOrOwner,
    update: managerOrOwner,
    delete: managerOrOwner,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    {
      name: 'store',
      type: 'relationship',
      relationTo: 'stores',
      // nullable for org-level admins (owner/manager overseeing multiple stores)
      required: false,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'cashier',
      options: ['owner', 'manager', 'cashier'],
    },
    {
      // Input-only: never persisted. A beforeChange hook hashes this into
      // pinHash and discards the plaintext before the row is written.
      name: 'pin',
      type: 'text',
      virtual: true,
      admin: { description: 'Fast till PIN login (4-6 digits). Never stored in plaintext.' },
    },
    {
      name: 'pinHash',
      type: 'text',
      admin: { readOnly: true, hidden: true },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data?.pin) {
          data.pinHash = hashPin(String(data.pin));
          delete data.pin;
        }
        return data;
      },
    ],
  },
};
