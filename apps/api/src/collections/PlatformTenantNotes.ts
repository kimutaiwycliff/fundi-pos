import type { CollectionConfig } from 'payload';

const platformAdmin = ({ req }: { req: { user?: { collection?: string } | null } }) => req.user?.collection === 'platform-admins';

// The operator's contact log for a tenant: calls, WhatsApps, visits and
// plain notes, each optionally with a date to follow up on. Replaces the
// single Tenants.platformNotes textarea (its text was carried over as each
// tenant's first note). Platform admins only - tenants never see these.
export const PlatformTenantNotes: CollectionConfig = {
  slug: 'platform-tenant-notes',
  admin: { useAsTitle: 'body', defaultColumns: ['tenant', 'kind', 'followUpOn', 'createdAt'] },
  defaultSort: '-createdAt',
  access: { read: platformAdmin, create: platformAdmin, update: () => false, delete: platformAdmin },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'author', type: 'relationship', relationTo: 'platform-admins', admin: { readOnly: true } },
    { name: 'kind', type: 'select', required: true, defaultValue: 'note', options: ['call', 'whatsapp', 'email', 'visit', 'note'] },
    { name: 'body', type: 'textarea', required: true, maxLength: 2000 },
    // Nairobi calendar date (YYYY-MM-DD) to chase this up on, if any.
    { name: 'followUpOn', type: 'text', index: true },
  ],
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (operation === 'create' && req.user?.collection === 'platform-admins') data.author = req.user.id;
        if (data.followUpOn === '') data.followUpOn = null;
        if (data.followUpOn != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.followUpOn))) {
          throw new Error('followUpOn must be a YYYY-MM-DD date');
        }
        return data;
      },
    ],
  },
};
