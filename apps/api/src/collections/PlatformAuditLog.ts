import type { CollectionConfig } from 'payload';

// Parallel to the tenant-facing AuditLog collection, not a shared one - that
// one's `actor` field is hard-typed to `relationTo: 'users'` (a tenant
// staff member), so a platform admin's id can't be written into it, and
// tenant owners/managers can already read their own tenant's AuditLog rows
// from their own dashboard (apps/web/dashboard/audit-log) - platform-level
// actions (and a platform admin's identity) should never surface there.
// Same append-only, hook-written shape as AuditLog.ts otherwise.
export const PlatformAuditLog: CollectionConfig = {
  slug: 'platform-audit-log',
  admin: { useAsTitle: 'summary' },
  access: {
    read: ({ req }) => req.user?.collection === 'platform-admins',
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    // Not required - unlike every other tenant-scoped collection, rows here
    // are meant to outlive the tenant itself (this IS the permanent record
    // that a tenant was ever purged). The DB's own ON DELETE SET NULL FK
    // action nulls this out automatically once a tenant is permanently
    // deleted (see /api/tenants/[id]/purge) - `summary` already holds a
    // self-contained human-readable record independent of this relationship,
    // same reasoning `required: true` would otherwise defeat entirely.
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', index: true },
    { name: 'actor', type: 'relationship', relationTo: 'platform-admins', required: true },
    {
      name: 'action',
      type: 'select',
      required: true,
      options: ['tenant_suspended', 'tenant_reactivated', 'tenant_soft_deleted', 'tenant_restored', 'subscription_changed'],
    },
    { name: 'summary', type: 'text', required: true },
    { name: 'metadata', type: 'json' },
  ],
};
