import config from '@payload-config';
import { randomBytes } from 'node:crypto';
import { getPayload } from 'payload';
import { TRIAL_DAYS } from '@hardware-pos/business-logic';
import { readGoogleSignupToken } from '@/lib/google';
import { notifyNewSignup } from '@/lib/notifications';
import { startSession } from '@/lib/sessions';
import { clientIp, findPriorTrials, recordTrialGrant } from '@/lib/trialGrants';

// Second step of a first-time Google sign-up: the shop name. Creates the
// shop (14-day trial) and its owner (random password - they sign in with
// Google, or set one later via "Forgot password?"), records the trial
// grant with the Google account ID, alerts the operator, signs them in.
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const body = (await request.json().catch(() => ({}))) as { signupToken?: string; businessName?: string };
  const businessName = typeof body.businessName === 'string' ? body.businessName.trim().slice(0, 120) : '';
  if (!businessName) return Response.json({ error: "What's your shop called?" }, { status: 400 });

  let identity;
  try {
    identity = await readGoogleSignupToken(payload, String(body.signupToken ?? ''));
  } catch {
    return Response.json({ error: 'This sign-up has expired - continue with Google again.' }, { status: 401 });
  }
  const taken = await payload.find({ collection: 'users', where: { email: { equals: identity.email } }, limit: 1, depth: 0, overrideAccess: true });
  if (taken.totalDocs > 0) return Response.json({ error: 'That email already has an account - sign in instead.' }, { status: 409 });

  const tenant = await payload.create({
    collection: 'tenants',
    overrideAccess: true,
    data: { name: businessName, status: 'active', subscriptionTier: 'trial', billingStatus: 'trialing' },
  });
  let owner;
  try {
    owner = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        tenant: tenant.id,
        role: 'owner',
        status: 'active',
        email: identity.email,
        name: identity.name ?? undefined,
        googleSub: identity.sub,
        password: randomBytes(24).toString('base64url'),
      },
    });
  } catch (err) {
    await payload.delete({ collection: 'tenants', id: tenant.id, overrideAccess: true }).catch(() => null);
    return Response.json({ error: err instanceof Error ? err.message : 'Could not create your account' }, { status: 400 });
  }

  const ip = clientIp(request.headers);
  const priors = await findPriorTrials(payload, { email: identity.email, ip, googleSub: identity.sub }).catch(() => []);
  await recordTrialGrant(payload, {
    tenantId: tenant.id,
    businessName,
    email: identity.email,
    ip,
    googleSub: identity.sub,
    source: 'signup',
    trialDays: TRIAL_DAYS,
  }).catch((err) => console.warn('[google signup] could not record trial grant', err));
  notifyNewSignup(payload, tenant.id, priors);

  const { token, exp } = await startSession(payload, 'users', { id: owner.id, email: String(owner.email) });
  return Response.json({ token, exp }, { status: 201 });
}
