import config from '@payload-config';
import { getPayload } from 'payload';
import { cyclePrice, subscriptionState, SUBSCRIPTION_STATE_LABELS, tenantAccess, TIER_LIST_PRICE, TRIAL_DAYS } from '@hardware-pos/business-logic';
import { billingUser } from '@/lib/billingAccount';
import { platformPaymentDetails } from '@/lib/notifications';

// The tenant's own view of their Fundi subscription (apps/web /billing):
// plan, where they stand, when access pauses, how to pay, what they've paid
// (including claims still being checked) and any trial extension request.
export async function GET() {
  const payload = await getPayload({ config });
  const auth = await billingUser(payload);
  if ('error' in auth) return auth.error;
  const { tenantId } = auth;

  const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true });
  const now = new Date();
  const [payments, requests] = await Promise.all([
    payload.find({
      collection: 'subscription-payments',
      where: { tenant: { equals: tenantId } },
      sort: '-createdAt',
      limit: 24,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'trial-extension-requests',
      where: { tenant: { equals: tenantId } },
      sort: '-createdAt',
      limit: 5,
      depth: 0,
      overrideAccess: true,
    }),
  ]);
  const state = subscriptionState(tenant as never, now);
  const access = tenantAccess(tenant as never, now);
  const trialEndsAt =
    (tenant.trialEndsAt as string | null) ?? new Date(new Date(tenant.createdAt as string).getTime() + TRIAL_DAYS * 86_400_000).toISOString();

  return Response.json({
    tenant: { id: tenant.id, name: tenant.name },
    plan: {
      tier: tenant.subscriptionTier,
      cycle: tenant.billingCycle ?? 'monthly',
      price: cyclePrice(tenant.planPrice as number | null, tenant.billingCycle as string | null, tenant.subscriptionTier as string),
    },
    state,
    stateLabel: SUBSCRIPTION_STATE_LABELS[state],
    allowed: access.allowed,
    lockAt: access.lockAt?.toISOString() ?? null,
    trialEndsAt,
    paidUntil: (tenant.paidUntil as string | null) ?? null,
    payTo: platformPaymentDetails(tenantId),
    // Published monthly prices - what a trial shop picks from.
    plans: Object.entries(TIER_LIST_PRICE)
      .filter(([, price]) => price > 0)
      .map(([tier, monthly]) => ({ tier, monthly })),
    payments: payments.docs.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      reference: p.reference ?? null,
      paidAt: p.paidAt,
      periodEnd: p.periodEnd ?? null,
      status: p.status,
      rejectReason: p.rejectReason ?? null,
    })),
    trialRequests: requests.docs.map((r) => ({
      id: r.id,
      status: r.status,
      message: r.message ?? null,
      daysGranted: r.daysGranted ?? null,
      createdAt: r.createdAt,
    })),
  });
}
