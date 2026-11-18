import config from '@payload-config';
import { getPayload } from 'payload';
import { cyclePrice } from '@hardware-pos/business-logic';
import { billingUser } from '@/lib/billingAccount';
import { notifyPaymentClaim } from '@/lib/notifications';

// "I've paid": the tenant reports a payment made outside the app. It's
// stored as a PENDING subscription payment - it changes nothing until the
// operator checks it against their M-Pesa statement and confirms it.
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const auth = await billingUser(payload);
  if ('error' in auth) return auth.error;
  const { user, tenantId } = auth;

  const body = (await request.json().catch(() => ({}))) as { amount?: unknown; reference?: unknown; paidAt?: unknown; note?: unknown };
  const amount = Number(body.amount);
  const reference = typeof body.reference === 'string' ? body.reference.trim().toUpperCase() : '';
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return Response.json({ error: 'Enter the amount you paid.' }, { status: 400 });
  }
  if (!/^[A-Z0-9]{6,20}$/.test(reference)) {
    return Response.json({ error: 'Enter the M-Pesa confirmation code, e.g. QJK7ABC123.' }, { status: 400 });
  }
  const paidAt = typeof body.paidAt === 'string' && !Number.isNaN(Date.parse(body.paidAt)) ? new Date(body.paidAt) : new Date();
  if (paidAt.getTime() > Date.now() + 86_400_000) return Response.json({ error: 'The payment date is in the future.' }, { status: 400 });

  // The same code twice is almost always a double tap or a resend.
  const existing = await payload.find({
    collection: 'subscription-payments',
    where: { tenant: { equals: tenantId }, reference: { equals: reference }, status: { not_equals: 'rejected' } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existing.totalDocs > 0) {
    return Response.json({ error: 'That M-Pesa code has already been sent - we will confirm it shortly.' }, { status: 409 });
  }
  const pending = await payload.count({
    collection: 'subscription-payments',
    where: { tenant: { equals: tenantId }, status: { equals: 'pending' } },
    overrideAccess: true,
  });
  if (pending.totalDocs >= 5) {
    return Response.json({ error: 'You already have several payments waiting to be confirmed. We will get to them shortly.' }, { status: 429 });
  }

  const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true });
  const expected = cyclePrice(tenant.planPrice as number | null, tenant.billingCycle as string | null, tenant.subscriptionTier as string);
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';

  const payment = await payload.create({
    collection: 'subscription-payments',
    overrideAccess: true,
    data: {
      tenant: tenantId,
      amount,
      method: 'mpesa',
      reference,
      paidAt: paidAt.toISOString(),
      status: 'pending',
      claimedBy: user.id,
      note: [note, expected > 0 && amount !== expected ? `Plan price is KES ${expected}.` : ''].filter(Boolean).join(' ') || undefined,
    },
  });
  notifyPaymentClaim(payload, payment.id);
  return Response.json({ id: payment.id, status: 'pending' }, { status: 201 });
}
