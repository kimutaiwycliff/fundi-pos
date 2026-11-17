import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { ACCESS_REVOKED_CODE, checkTenantAccess } from '@/lib/billing';
import { isTenantUser, toID } from '@/lib/relations';
import { extendTillSession, mintTillToken } from '@/lib/tillAuth';
import { activitySource, recordActivity } from '@/lib/activity';
import { DEVICE_REVOKED_MESSAGE, isDeviceRevoked, terminalFromHeaders, touchDevice } from '@/lib/devices';

// Lets an already-logged-in till (still holding a currently-valid session)
// silently extend its own session another TILL_TOKEN_TTL_SECONDS - a till
// that's regularly online (apps/mobile and apps/desktop both call this
// periodically while connected, see their own App.tsx) never actually
// needs a fresh phone+PIN login; only one that goes fully offline for the
// entire TILL_TOKEN_TTL_SECONDS window without ever reconnecting does.
//
// Requires an UNEXPIRED token to call at all - Payload's own JWT auth
// strategy rejects an already-expired one before this handler ever runs
// (payload.auth() below returns { user: null }). By design this is a
// sliding renewal, not a way to resurrect a session that's already lapsed;
// that case needs a real login, same as Payload's own built-in
// /api/users/refresh-token.
export async function POST() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Same re-checks as pin-login/route.ts - a till silently renewing its own
  // session forever would otherwise never notice a ban or a canceled
  // subscription until its (now very long-lived) token eventually expired
  // on its own.
  const tenant = await payload.findByID({ collection: 'tenants', id: toID(user.tenant), overrideAccess: true });
  const billing = checkTenantAccess(tenant);
  if (!billing.allowed) {
    return Response.json({ error: billing.message, code: ACCESS_REVOKED_CODE, reason: billing.reason }, { status: 403 });
  }
  if (user.status === 'banned') {
    return Response.json({ error: 'This account has been disabled.', code: ACCESS_REVOKED_CODE }, { status: 403 });
  }

  // Set by the JWT auth strategy (auth/strategies/jwt.js) on every
  // authenticated request when the collection uses sessions - not part of
  // the generated User type since it's a runtime-only field, never stored.
  const sid = (user as unknown as { _sid?: string })._sid;
  if (!sid) {
    return Response.json({ error: 'No active session to refresh' }, { status: 400 });
  }

  const headers = await nextHeaders();
  const till = terminalFromHeaders(headers);
  if (await isDeviceRevoked(payload, toID(user.tenant), till.terminalId)) {
    return Response.json({ error: DEVICE_REVOKED_MESSAGE, code: ACCESS_REVOKED_CODE, reason: 'device_revoked' }, { status: 403 });
  }

  await extendTillSession(payload, user.id, sid);
  recordActivity(payload, { userId: user.id, tenantId: toID(user.tenant), source: activitySource(headers) });
  touchDevice(payload, { tenantId: toID(user.tenant), ...till, platform: activitySource(headers), userId: user.id });
  const { token, exp } = await mintTillToken(payload, { id: user.id, email: user.email, sid });

  return Response.json({ token, exp, user });
}
