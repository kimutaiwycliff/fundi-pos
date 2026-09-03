import type { CollectionConfig } from 'payload';
import { toID } from '../lib/relations.ts';

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: { useAsTitle: 'name' },
  access: {
    // A tenant user may only ever read/update their own tenant record,
    // scoped by `id` - Tenants has no `tenant` relationship field (a
    // tenant doesn't belong to itself), so the shared ownerOnly helper
    // (which filters by `{ tenant: { equals: ... } }`, correct for every
    // OTHER collection) doesn't apply here. update reused it anyway until
    // now, which silently 500'd on the very first real PATCH ever issued
    // against this collection ("Cannot find field for path at tenant" -
    // Postgres/Drizzle rejecting a WHERE clause on a column that doesn't
    // exist) - caught live wiring up the dashboard's Settings page, the
    // first thing in this whole project to ever call it.
    read: ({ req }) => {
      if (req.user?.collection === 'platform-admins') return true;
      if (!req.user) return false;
      return { id: { equals: toID(req.user.tenant) } };
    },
    update: ({ req }) => {
      if (req.user?.collection === 'platform-admins') return true;
      if (!req.user || req.user.role !== 'owner') return false;
      return { id: { equals: toID(req.user.tenant) } };
    },
    // Self-serve signup (apps/web's /signup) creates tenants via
    // overrideAccess: true, bypassing this entirely - this specifically
    // governs the OTHER path, a platform admin manually onboarding a
    // client through /admin (e.g. someone who paid before ever visiting
    // the signup page). Still blocked for tenant users themselves; a
    // tenant can never create another tenant.
    create: ({ req }) => req.user?.collection === 'platform-admins',
    delete: () => false,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      // Platform-admin-controlled suspend/soft-delete - distinct from
      // billingStatus below (which reflects the *subscription's* state,
      // e.g. payment failures). 'suspended'/'deleted' both lock out every
      // login path for this tenant (see lib/billing.ts's checkTenantAccess,
      // the same shared choke point billingStatus === 'canceled' already
      // used) without touching any other collection's rows - "deleted"
      // here is always reversible (Restore sets this back to 'active'),
      // never a real data purge.
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: ['active', 'suspended', 'deleted'],
      access: { update: ({ req }) => req.user?.collection === 'platform-admins' },
      admin: { description: 'Suspended/deleted tenants (and all their staff) are locked out of every login path - web, till PIN, and PowerSync.' },
    },
    { name: 'statusChangedAt', type: 'date', admin: { readOnly: true } },
    { name: 'statusReason', type: 'text', admin: { description: 'Optional note - shown in the platform audit log, not to the tenant.' } },
    {
      name: 'subscriptionTier',
      type: 'select',
      required: true,
      defaultValue: 'trial',
      options: ['trial', 'starter', 'growth', 'enterprise'],
      // Previously writable by a tenant's own owner (Tenants.update allows
      // it) even though no UI ever exposed that - now that the platform
      // panel is the intended single source of truth for this, closing it.
      access: { update: ({ req }) => req.user?.collection === 'platform-admins' },
    },
    {
      name: 'billingStatus',
      type: 'select',
      required: true,
      defaultValue: 'trialing',
      options: ['active', 'trialing', 'past_due', 'canceled'],
      access: { update: ({ req }) => req.user?.collection === 'platform-admins' },
    },
    {
      // Printed on every receipt, above the line items - typically a
      // physical address/phone/KRA PIN, since `name` alone is already the
      // header's title line. Synced to the till (docker/powersync/
      // sync-config.yaml) so printing works fully offline once it's synced
      // down once.
      name: 'receiptHeader',
      type: 'textarea',
      admin: { description: 'Printed at the top of every receipt, below the business name (e.g. address, phone).' },
    },
    {
      name: 'receiptFooter',
      type: 'textarea',
      admin: { description: 'Printed at the bottom of every receipt (e.g. "Thank you for your business!", return policy).' },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation }) => {
        if (operation === 'update' && data.status && originalDoc && data.status !== originalDoc.status) {
          data.statusChangedAt = new Date().toISOString();
        }
        return data;
      },
    ],
    afterChange: [
      // Only a platform admin can actually change these fields (see the
      // field-level access above), so this only ever fires for genuine
      // platform actions - never for a tenant owner's own Settings edits.
      async ({ doc, previousDoc, operation, req }) => {
        if (operation !== 'update' || !previousDoc || req.user?.collection !== 'platform-admins') return doc;

        const statusChanged = doc.status !== previousDoc.status;
        const subscriptionChanged = doc.subscriptionTier !== previousDoc.subscriptionTier || doc.billingStatus !== previousDoc.billingStatus;
        if (!statusChanged && !subscriptionChanged) return doc;

        let action: 'tenant_suspended' | 'tenant_reactivated' | 'tenant_soft_deleted' | 'tenant_restored' | 'subscription_changed';
        let summary: string;
        let metadata: Record<string, unknown>;
        if (statusChanged) {
          if (doc.status === 'suspended') {
            action = 'tenant_suspended';
            summary = `${doc.name} suspended`;
          } else if (doc.status === 'deleted') {
            action = 'tenant_soft_deleted';
            summary = `${doc.name} soft-deleted`;
          } else if (previousDoc.status === 'deleted') {
            action = 'tenant_restored';
            summary = `${doc.name} restored`;
          } else {
            action = 'tenant_reactivated';
            summary = `${doc.name} reactivated`;
          }
          metadata = { from: previousDoc.status, to: doc.status, reason: doc.statusReason ?? null };
        } else {
          action = 'subscription_changed';
          summary = `${doc.name}: ${previousDoc.subscriptionTier} -> ${doc.subscriptionTier}, ${previousDoc.billingStatus} -> ${doc.billingStatus}`;
          metadata = {
            subscriptionTier: { from: previousDoc.subscriptionTier, to: doc.subscriptionTier },
            billingStatus: { from: previousDoc.billingStatus, to: doc.billingStatus },
          };
        }
        if (doc.statusReason) summary += ` (${doc.statusReason})`;

        await req.payload.create({
          collection: 'platform-audit-log',
          overrideAccess: true,
          data: { tenant: Number(doc.id), actor: Number(req.user.id), action, summary, metadata },
          req,
        });
        return doc;
      },
    ],
  },
};
