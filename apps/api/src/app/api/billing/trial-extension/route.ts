import config from '@payload-config';
import { getPayload } from 'payload';
import { subscriptionState } from '@hardware-pos/business-logic';
import { billingUser } from '@/lib/billingAccount';
import { notifyTrialExtensionRequest } from '@/lib/notifications';

// "Can I have more time?" - only while on (or just off) a trial, and one
// open request at a time. The operator decides on the tenant's Billing tab.
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const auth = await billingUser(payload);
  if ('error' in auth) return auth.error;
  const { user, tenantId } = auth;

  const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true });
  const state = subscriptionState(tenant as never, new Date());
  if (state !== 'trial' && state !== 'trial_ending' && state !== 'trial_expired') {
    return Response.json({ error: 'Trial extensions are only for shops on a free trial.' }, { status: 400 });
  }
  const open = await payload.count({
    collection: 'trial-extension-requests',
    where: { tenant: { equals: tenantId }, status: { equals: 'pending' } },
    overrideAccess: true,
  });
  if (open.totalDocs > 0) return Response.json({ error: 'You already have a request waiting - we will reply soon.' }, { status: 409 });

  const body = (await request.json().catch(() => ({}))) as { message?: unknown };
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 1000) : '';
  const created = await payload.create({
    collection: 'trial-extension-requests',
    overrideAccess: true,
    data: { tenant: tenantId, requestedBy: user.id, message: message || undefined, status: 'pending' },
  });
  notifyTrialExtensionRequest(payload, created.id);
  return Response.json({ id: created.id, status: 'pending' }, { status: 201 });
}
