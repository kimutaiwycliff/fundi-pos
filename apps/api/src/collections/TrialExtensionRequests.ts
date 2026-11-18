import type { CollectionConfig } from 'payload';
import { APIError } from 'payload';
import { toID } from '../lib/relations.ts';
import { invalidatePlatformStats } from '../lib/platformStatsCache.ts';
import { notifyTrialExtensionDecision } from '../lib/notifications.ts';

const DAY = 24 * 60 * 60 * 1000;
const platformAdmin = ({ req }: { req: { user?: { collection?: string } | null } }) => req.user?.collection === 'platform-admins';

// End of the Nairobi calendar day `days` from `from` - trials end at
// midnight Nairobi, not at whatever time the operator clicked approve.
function endOfNairobiDay(from: Date, days: number): Date {
  const nairobi = new Date(from.getTime() + 3 * 60 * 60 * 1000 + days * DAY);
  return new Date(Date.UTC(nairobi.getUTCFullYear(), nairobi.getUTCMonth(), nairobi.getUTCDate(), 23, 59, 59) - 3 * 60 * 60 * 1000);
}

// A tenant owner asking for more trial time (POST /api/billing/trial-
// extension creates these). The operator approves with a number of days
// - which moves the tenant's trialEndsAt and so lifts an automatic
// lockout - or declines. Either way the owner is emailed.
export const TrialExtensionRequests: CollectionConfig = {
  slug: 'trial-extension-requests',
  admin: { defaultColumns: ['tenant', 'status', 'createdAt'] },
  defaultSort: '-createdAt',
  access: { read: platformAdmin, create: () => false, update: platformAdmin, delete: () => false },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'requestedBy', type: 'relationship', relationTo: 'users' },
    { name: 'message', type: 'textarea', maxLength: 1000 },
    { name: 'status', type: 'select', required: true, defaultValue: 'pending', options: ['pending', 'approved', 'declined'], index: true },
    { name: 'daysGranted', type: 'number', min: 1, max: 90 },
    { name: 'decidedBy', type: 'relationship', relationTo: 'platform-admins', admin: { readOnly: true } },
    { name: 'decidedAt', type: 'date', admin: { readOnly: true } },
    // What the trial end moved to, for the record.
    { name: 'newTrialEndsAt', type: 'date', admin: { readOnly: true } },
  ],
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        if (operation !== 'update') return data;
        const from = originalDoc?.status;
        const to = data.status ?? from;
        if (from !== 'pending' && to !== from) throw new APIError('This request has already been decided.', 409);
        if (from === 'pending' && to !== 'pending') {
          if (to === 'approved' && !(Number(data.daysGranted ?? originalDoc?.daysGranted) > 0)) {
            throw new APIError('Say how many days to extend the trial by.', 400);
          }
          data.decidedAt = new Date().toISOString();
          if (req.user?.collection === 'platform-admins') data.decidedBy = req.user.id;
          if (to === 'approved') {
            const tenant = await req.payload.findByID({ collection: 'tenants', id: toID(originalDoc.tenant), depth: 0, overrideAccess: true, req });
            // Extend from whichever is later - today or the current trial end - so
            // approving early never shortens anything.
            const current = tenant.trialEndsAt ? new Date(tenant.trialEndsAt as string) : new Date();
            const base = current > new Date() ? current : new Date();
            data.newTrialEndsAt = endOfNairobiDay(base, Number(data.daysGranted ?? originalDoc.daysGranted)).toISOString();
          }
        }
        return data;
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        invalidatePlatformStats();
        if (operation !== 'update' || previousDoc?.status !== 'pending' || doc.status === 'pending') return doc;
        const tenantId = toID(doc.tenant);
        const tenant = await req.payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true, req });
        if (doc.status === 'approved' && doc.newTrialEndsAt) {
          await req.payload.update({
            collection: 'tenants',
            id: tenantId,
            // Back on a trial clock: a tenant that had been moved to a paid tier
            // but never paid gets the extension honoured too.
            data: { trialEndsAt: doc.newTrialEndsAt, subscriptionTier: 'trial', billingStatus: 'trialing' },
            overrideAccess: true,
            context: { skipPlatformAudit: true },
            req,
          });
        }
        if (req.user?.collection === 'platform-admins') {
          await req.payload.create({
            collection: 'platform-audit-log',
            overrideAccess: true,
            data: {
              tenant: Number(tenantId),
              actor: Number(req.user.id),
              action: 'billing_updated',
              summary:
                doc.status === 'approved'
                  ? `${tenant.name}: trial extended by ${doc.daysGranted} day${doc.daysGranted === 1 ? '' : 's'} (request approved)`
                  : `${tenant.name}: trial extension request declined`,
              metadata: { requestId: doc.id, status: doc.status, daysGranted: doc.daysGranted ?? null, newTrialEndsAt: doc.newTrialEndsAt ?? null },
            },
            req,
          });
        }
        notifyTrialExtensionDecision(req.payload, { tenantId, approved: doc.status === 'approved', days: doc.daysGranted ?? null, newTrialEndsAt: doc.newTrialEndsAt ?? null, requestId: doc.id });
        return doc;
      },
    ],
  },
};
