import type { Access, CollectionConfig, PayloadRequest } from 'payload';
import { APIError } from 'payload';
import { nextBillingPeriod } from '@hardware-pos/business-logic';
import { toID } from '../lib/relations.ts';
import { invalidatePlatformStats } from '../lib/platformStatsCache.ts';
import { notifyPaymentDecision } from '../lib/notifications.ts';

const platformAdmin: Access = ({ req }) => req.user?.collection === 'platform-admins';

// The SaaS operator's ledger of what each tenant has paid for their Fundi
// subscription (M-Pesa, bank, etc. - recorded by a platform admin; billing
// is manual). Never visible to tenants. Each payment covers a period, and
// the tenant's paidUntil is always the latest periodEnd on file, so
// recording - or deleting a mistaken - payment keeps it right.
export const SubscriptionPayments: CollectionConfig = {
  slug: 'subscription-payments',
  admin: { useAsTitle: 'reference', defaultColumns: ['tenant', 'amount', 'method', 'paidAt', 'periodEnd'] },
  access: { read: platformAdmin, create: platformAdmin, update: platformAdmin, delete: platformAdmin },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'amount', type: 'number', required: true, min: 0 },
    { name: 'method', type: 'select', required: true, defaultValue: 'mpesa', options: ['mpesa', 'bank', 'card', 'cash', 'other'] },
    { name: 'reference', type: 'text', admin: { description: 'e.g. the M-Pesa code (QJK7XXXX).' } },
    { name: 'paidAt', type: 'date', required: true, index: true },
    { name: 'periodStart', type: 'date' },
    { name: 'periodEnd', type: 'date', index: true },
    { name: 'note', type: 'textarea' },
    { name: 'recordedBy', type: 'relationship', relationTo: 'platform-admins', admin: { readOnly: true } },
    // Payments happen outside the app. The operator records one directly
    // (confirmed), or the tenant taps "I've paid" (POST /api/billing/claim),
    // which lands here as pending until the operator confirms or rejects it.
    // Only confirmed payments count towards paidUntil, MRR and collections.
    { name: 'status', type: 'select', required: true, defaultValue: 'confirmed', options: ['pending', 'confirmed', 'rejected'], index: true },
    { name: 'claimedBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'decidedBy', type: 'relationship', relationTo: 'platform-admins', admin: { readOnly: true } },
    { name: 'decidedAt', type: 'date', admin: { readOnly: true } },
    { name: 'rejectReason', type: 'text', admin: { description: 'Shown to the tenant in the rejection email.' } },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        const before = originalDoc?.status as string | undefined;
        const after = (data.status ?? before ?? 'confirmed') as string;
        // Only a pending claim moves; a confirmed or rejected payment stays put
        // (delete a mistaken one instead).
        if (operation === 'update' && before && before !== 'pending' && after !== before) {
          throw new APIError('Only a pending payment claim can be confirmed or rejected.', 409);
        }
        if (operation === 'update' && before === 'pending' && after !== 'pending') {
          data.decidedAt = new Date().toISOString();
          if (req.user?.collection === 'platform-admins') data.decidedBy = req.user.id;
        }
        if (operation === 'create') {
          if (req.user?.collection === 'platform-admins') data.recordedBy = req.user.id;
          if (!data.paidAt) data.paidAt = new Date().toISOString();
        }
        // A confirmed payment always covers a period. Default: one billing
        // cycle continuing from the current paid-until (so paying early never
        // loses days). Claims carry no period until they're confirmed.
        if (after === 'confirmed' && !data.periodEnd && !originalDoc?.periodEnd) {
          const tenant = await req.payload.findByID({
            collection: 'tenants',
            id: toID(data.tenant ?? originalDoc?.tenant),
            overrideAccess: true,
            depth: 0,
            req,
          });
          const period = nextBillingPeriod(tenant.paidUntil as string | null, tenant.billingCycle as string | null);
          data.periodStart = data.periodStart ?? period.start.toISOString();
          data.periodEnd = period.end.toISOString();
        }
        if (data.periodStart && data.periodEnd && new Date(data.periodEnd) <= new Date(data.periodStart)) {
          throw new APIError('The period must end after it starts.', 400);
        }
        return data;
      },
    ],
    afterChange: [
      () => invalidatePlatformStats(),
      async ({ doc, previousDoc, operation, req }) => {
        await syncPaidUntil(req, toID(doc.tenant));
        if (operation === 'create' && doc.status !== 'pending') await logPayment(req, doc, 'payment_recorded');
        if (operation === 'update') {
          // Moved to another tenant: the old one's paidUntil needs redoing too.
          if (previousDoc?.tenant && toID(previousDoc.tenant) !== toID(doc.tenant)) await syncPaidUntil(req, toID(previousDoc.tenant));
          await logPaymentEdit(req, doc, previousDoc ?? {});
          if (previousDoc?.status === 'pending' && (doc.status === 'confirmed' || doc.status === 'rejected')) {
            notifyPaymentDecision(req.payload, { paymentId: doc.id, tenantId: toID(doc.tenant) });
          }
        }
        return doc;
      },
    ],
    afterDelete: [
      () => invalidatePlatformStats(),
      async ({ doc, req }) => {
        await syncPaidUntil(req, toID(doc.tenant));
        await logPayment(req, doc, 'payment_deleted');
        return doc;
      },
    ],
  },
};

// paidUntil = the latest periodEnd among the tenant's payments (null when
// none are left). A payment that brings the tenant back into good standing
// also flips a past_due billing status back to active.
async function syncPaidUntil(req: PayloadRequest, tenantId: string | number) {
  const latest = await req.payload.find({
    collection: 'subscription-payments',
    where: { tenant: { equals: tenantId }, status: { equals: 'confirmed' } },
    sort: '-periodEnd',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  const paidUntil = (latest.docs[0]?.periodEnd as string | undefined) ?? null;
  const tenant = await req.payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true, depth: 0, req });
  const data: Record<string, unknown> = { paidUntil };
  if (paidUntil && new Date(paidUntil) > new Date() && tenant.billingStatus === 'past_due') data.billingStatus = 'active';
  await req.payload.update({
    collection: 'tenants',
    id: tenantId,
    data,
    overrideAccess: true,
    // Bookkeeping write - Tenants' afterChange skips its own audit entry
    // (the payment itself is logged below instead).
    context: { skipPlatformAudit: true },
    req,
  });
}

async function logPayment(req: PayloadRequest, doc: Record<string, unknown>, action: 'payment_recorded' | 'payment_deleted') {
  if (req.user?.collection !== 'platform-admins') return;
  const tenant = await req.payload.findByID({ collection: 'tenants', id: toID(doc.tenant), overrideAccess: true, depth: 0, req });
  const amount = `KES ${Number(doc.amount ?? 0).toLocaleString('en-KE')}`;
  await req.payload.create({
    collection: 'platform-audit-log',
    overrideAccess: true,
    data: {
      tenant: Number(tenant.id),
      actor: Number(req.user.id),
      action,
      summary: `${tenant.name}: ${action === 'payment_recorded' ? 'payment recorded' : 'payment deleted'} - ${amount}${doc.reference ? ` (${doc.reference})` : ''}`,
      metadata: { amount: doc.amount, method: doc.method, reference: doc.reference ?? null, periodEnd: doc.periodEnd ?? null },
    },
    req,
  });
}

const EDIT_TRACKED = ['tenant', 'amount', 'method', 'reference', 'paidAt', 'periodStart', 'periodEnd', 'note', 'status', 'rejectReason'] as const;

// Edits used to go unlogged (only record/delete were). Logged as
// billing_updated - the platform_audit_log action enum has no payment_updated
// value, and the summary says exactly what happened anyway.
async function logPaymentEdit(req: PayloadRequest, doc: Record<string, unknown>, previousDoc: Record<string, unknown>) {
  if (req.user?.collection !== 'platform-admins') return;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of EDIT_TRACKED) {
    const from = field === 'tenant' ? (previousDoc.tenant != null ? toID(previousDoc.tenant) : null) : (previousDoc[field] ?? null);
    const to = field === 'tenant' ? (doc.tenant != null ? toID(doc.tenant) : null) : (doc[field] ?? null);
    if (String(from) !== String(to)) changes[field] = { from, to };
  }
  if (Object.keys(changes).length === 0) return;
  const tenant = await req.payload.findByID({ collection: 'tenants', id: toID(doc.tenant), overrideAccess: true, depth: 0, req });
  const amount = `KES ${Number(doc.amount ?? 0).toLocaleString('en-KE')}`;
  await req.payload.create({
    collection: 'platform-audit-log',
    overrideAccess: true,
    data: {
      tenant: Number(tenant.id),
      actor: Number(req.user.id),
      action: 'billing_updated',
      summary: changes.status
        ? `${tenant.name}: payment claim ${doc.status} - ${amount}${doc.reference ? ` (${doc.reference})` : ''}`
        : `${tenant.name}: payment edited - ${amount}${doc.reference ? ` (${doc.reference})` : ''} (${Object.keys(changes).join(', ')})`,
      metadata: { paymentId: doc.id, changes },
    },
    req,
  });
}
