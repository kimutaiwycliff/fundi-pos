import type { Access, CollectionConfig, PayloadRequest } from 'payload';
import { APIError } from 'payload';
import { nextBillingPeriod } from '@hardware-pos/business-logic';
import { toID } from '../lib/relations.ts';

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
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation === 'create') {
          if (req.user?.collection === 'platform-admins') data.recordedBy = req.user.id;
          if (!data.paidAt) data.paidAt = new Date().toISOString();
          // Default period: one billing cycle continuing from the current
          // paid-until (so paying early never loses days).
          if (!data.periodEnd) {
            const tenant = await req.payload.findByID({ collection: 'tenants', id: toID(data.tenant), overrideAccess: true, depth: 0, req });
            const period = nextBillingPeriod(tenant.paidUntil as string | null, tenant.billingCycle as string | null);
            data.periodStart = data.periodStart ?? period.start.toISOString();
            data.periodEnd = period.end.toISOString();
          }
        }
        if (data.periodStart && data.periodEnd && new Date(data.periodEnd) <= new Date(data.periodStart)) {
          throw new APIError('The period must end after it starts.', 400);
        }
        return data;
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        await syncPaidUntil(req, toID(doc.tenant));
        if (operation === 'create') await logPayment(req, doc, 'payment_recorded');
        return doc;
      },
    ],
    afterDelete: [
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
    where: { tenant: { equals: tenantId } },
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
