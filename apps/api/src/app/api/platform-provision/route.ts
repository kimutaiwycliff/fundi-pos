import config from '@payload-config';
import { randomBytes } from 'node:crypto';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { TRIAL_DAYS } from '@hardware-pos/business-logic';
import { sendOwnerWelcome } from '@/lib/notifications';
import { createSetPasswordLink } from '@/lib/setPasswordLink';
import { findPriorTrials, recordTrialGrant } from '@/lib/trialGrants';

const TIERS = ['trial', 'starter', 'growth', 'enterprise'] as const;

// PLATFORM-ADMIN ONLY. "Add tenant" from the console: creates the shop and
// its owner (with a random password nobody knows), records the trial grant,
// and returns a set-password link - also emailed to the owner - so they
// choose their own. Refuses an email that already has an account, and
// warns (409 prior_trial) if this email or phone already had a trial unless
// the operator ticks "grant anyway".
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (user?.collection !== 'platform-admins') return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const businessName = str(body.businessName);
  const ownerName = str(body.ownerName);
  const ownerEmail = str(body.ownerEmail).toLowerCase();
  const ownerPhone = str(body.ownerPhone, 30);
  const tier = TIERS.includes(body.tier as (typeof TIERS)[number]) ? (body.tier as (typeof TIERS)[number]) : 'trial';
  const trialDays = body.trialDays === undefined ? TRIAL_DAYS : Math.max(0, Math.min(90, Math.round(Number(body.trialDays) || 0)));
  const allowRepeatTrial = body.allowRepeatTrial === true;

  if (!businessName) return Response.json({ error: 'Business name is required.' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return Response.json({ error: "Enter the owner's email address." }, { status: 400 });

  const existing = await payload.find({ collection: 'users', where: { email: { equals: ownerEmail } }, limit: 1, depth: 0, overrideAccess: true });
  if (existing.totalDocs > 0) {
    return Response.json({ error: 'That email already has a Fundi POS account.', code: 'account_exists' }, { status: 409 });
  }
  const priors = trialDays > 0 ? await findPriorTrials(payload, { email: ownerEmail, phone: ownerPhone }) : [];
  if (priors.length > 0 && !allowRepeatTrial) {
    return Response.json({ error: 'This email or phone has had a free trial before.', code: 'prior_trial', priors }, { status: 409 });
  }

  const now = Date.now();
  const tenant = await payload.create({
    collection: 'tenants',
    overrideAccess: true,
    data: {
      name: businessName,
      status: 'active',
      subscriptionTier: tier,
      billingStatus: tier === 'trial' ? 'trialing' : 'active',
      trialEndsAt: new Date(now + trialDays * 86_400_000).toISOString(),
      billingContactName: ownerName || undefined,
      billingContactPhone: ownerPhone || undefined,
      billingContactEmail: ownerEmail,
    },
  });
  try {
    await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        tenant: tenant.id,
        role: 'owner',
        status: 'active',
        email: ownerEmail,
        name: ownerName || undefined,
        phone: ownerPhone || undefined,
        password: randomBytes(24).toString('base64url'),
      },
    });
  } catch (err) {
    // Same compensating action as self-serve signup: never leave an owner-less tenant.
    await payload.delete({ collection: 'tenants', id: tenant.id, overrideAccess: true }).catch(() => null);
    const message = err instanceof Error ? err.message : 'Could not create the owner';
    return Response.json({ error: message }, { status: 400 });
  }

  if (trialDays > 0) {
    await recordTrialGrant(payload, { tenantId: tenant.id, businessName, email: ownerEmail, phone: ownerPhone, source: 'operator', trialDays, repeatOverride: priors.length > 0 });
  }
  const link = await createSetPasswordLink(payload, ownerEmail);
  const emailed = await sendOwnerWelcome(payload, { tenantId: tenant.id, ownerEmail, ownerName: ownerName || null, link, trialDays });
  await payload.create({
    collection: 'platform-audit-log',
    overrideAccess: true,
    data: {
      tenant: Number(tenant.id),
      actor: Number(user.id),
      action: 'tenant_provisioned',
      summary: `${businessName} added by an operator (${tier}${trialDays > 0 ? `, ${trialDays}-day trial` : ''})${priors.length ? ' - repeat trial granted anyway' : ''}`,
      metadata: { tier, trialDays, ownerEmail, priorTrialIds: priors.map((p) => p.id) },
    },
  });
  return Response.json({ tenantId: tenant.id, setPasswordLink: link, emailed }, { status: 201 });
}
