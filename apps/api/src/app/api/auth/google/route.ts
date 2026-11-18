import config from '@payload-config';
import { getPayload } from 'payload';
import { activitySource, recordActivity } from '@/lib/activity';
import { checkTenantAccess } from '@/lib/billing';
import { signGoogleSignupToken, verifyGoogleIdToken } from '@/lib/google';
import { toID } from '@/lib/relations';
import { startSession } from '@/lib/sessions';

// "Continue with Google" (apps/web runs the OAuth redirect and posts the ID
// token here). A user whose verified Google email matches an account signs
// in - with the same ban / lockout checks as a password login. Anyone else
// gets a short-lived signupToken for the "what's your shop called?" step.
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { idToken, nonce } = (await request.json().catch(() => ({}))) as { idToken?: string; nonce?: string };
  if (!idToken) return Response.json({ error: 'Missing Google token' }, { status: 400 });

  let identity;
  try {
    identity = await verifyGoogleIdToken(idToken, nonce ?? null);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Google sign-in failed' }, { status: 401 });
  }

  const found = await payload.find({
    collection: 'users',
    where: { or: [{ googleSub: { equals: identity.sub } }, { email: { equals: identity.email } }] },
    limit: 2,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  });
  const user = found.docs.find((u) => u.googleSub === identity.sub) ?? found.docs[0];
  if (!user) {
    return Response.json({ signupToken: await signGoogleSignupToken(payload, identity), email: identity.email, name: identity.name });
  }

  if (user.status === 'banned') return Response.json({ error: 'This account has been disabled. Contact your manager or owner.' }, { status: 403 });
  const tenant = await payload.findByID({ collection: 'tenants', id: toID(user.tenant), depth: 0, overrideAccess: true });
  const access = checkTenantAccess(tenant);
  if (!access.allowed) return Response.json({ error: access.message, reason: access.reason }, { status: 403 });

  if (!user.googleSub) {
    // First Google sign-in for an existing (email-verified by Google) account: link it.
    await payload.update({ collection: 'users', id: user.id, data: { googleSub: identity.sub }, overrideAccess: true });
  }
  const { token, exp } = await startSession(payload, 'users', { id: user.id, email: String(user.email) });
  recordActivity(payload, { userId: user.id, tenantId: toID(user.tenant), source: activitySource(request.headers), login: true });
  await payload.create({
    collection: 'audit-log',
    overrideAccess: true,
    data: {
      tenant: Number(toID(user.tenant)),
      actor: Number(user.id),
      action: 'login',
      entityType: 'user',
      entityId: String(user.id),
      summary: `${user.name || user.email} logged in (Google)`,
    },
  });
  return Response.json({ token, exp });
}
