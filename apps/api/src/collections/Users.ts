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
      // admin.hidden only hides it from the admin UI - without this, the
      // scrypt hash of a 4-6 digit PIN (small enough to brute-force
      // offline in seconds) was coming back in every REST/GraphQL response
      // that includes a user, including a cashier's own /api/users/me.
      // Caught live while smoke-testing the containerized web dashboard's
      // login route. overrideAccess: true callers (the manager-PIN
      // authorize-status route, PowerSync's direct-Postgres replication)
      // are unaffected - this only governs the ordinary API.
      access: { read: () => false },
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
