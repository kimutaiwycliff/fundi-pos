import type { CollectionConfig } from 'payload';
import { managerOrOwner } from '../access/index.ts';

// Append-only, same principle as StockMovements/Orders - a record of who
// changed a price or voided/refunded a sale should never itself be
// editable, or it stops meaning anything as an audit trail. Written by
// hooks/routes with overrideAccess, never directly by a client - there is
// deliberately no `create` access for ordinary staff.
export const AuditLog: CollectionConfig = {
  slug: 'audit-log',
  admin: { useAsTitle: 'summary', defaultColumns: ['action', 'summary', 'actor', 'createdAt'] },
  access: {
    read: managerOrOwner,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'actor', type: 'relationship', relationTo: 'users', required: true },
    {
      name: 'action',
      type: 'select',
      required: true,
      options: ['price_changed', 'order_voided', 'order_refunded'],
    },
    { name: 'entityType', type: 'select', required: true, options: ['product', 'order'] },
    { name: 'entityId', type: 'text', required: true, index: true },
    { name: 'summary', type: 'text', required: true },
    // Raw before/after values - `summary` is what the dashboard shows at a
    // glance, this is what's actually available if someone needs the exact
    // numbers later.
    { name: 'metadata', type: 'json' },
  ],
};
