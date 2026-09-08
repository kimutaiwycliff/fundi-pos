import { SignJWT } from 'jose';
import type { Payload } from 'payload';

// Till sessions (PIN login, and the /api/auth/till-refresh route that
// reuses this) get a much longer life than the web dashboard's default 2h
// (Users.ts's own collectionConfig.auth.tokenExpiration, left untouched) -
// deliberately, to support the offline-first till workflow: a device that's
// connected once should be able to keep resuming locally (session.ts's own
// matching 30-day OFFLINE_SESSION_TTL_MS on both apps/mobile and
// apps/desktop) for up to this long without the underlying server session
// actually going stale, even across long stretches with no connectivity at
// all in between. Scoped to till logins only, not applied to Users.ts's own
// collection-level tokenExpiration - the web dashboard's own login
// (payload.login(), a browser session with a different threat model) keeps
// the shorter default.
export const TILL_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function mintTillToken(
  payload: Payload,
  args: { id: number | string; email: string; sid: string },
): Promise<{ token: string; exp: number }> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const exp = issuedAt + TILL_TOKEN_TTL_SECONDS;
  // payload.secret, not process.env.PAYLOAD_SECRET directly - Payload's own
  // verification (auth/strategies/jwt.js) signs/checks against this exact
  // value, and nothing guarantees it's untransformed from the raw env var.
  const secret = new TextEncoder().encode(payload.secret);
  // Header must include typ: 'JWT' - Payload's own jwtSign() does, and a
  // token missing it was silently rejected by the JWT auth strategy
  // (confirmed live: /api/users/me came back { user: null } with it absent).
  const token = await new SignJWT({ id: args.id, collection: 'users', email: args.email, sid: args.sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(exp)
    .sign(secret);
  return { token, exp };
}

// payload/shared's addSessionToUser always sizes the session it just added
// off the shared collectionConfig.auth.tokenExpiration (2h, same as the web
// dashboard) - this overwrites just that one session's own expiresAt to
// TILL_TOKEN_TTL_SECONDS instead, via the same low-level payload.db.updateOne()
// path Payload's own built-in refresh operation uses internally. A normal
// payload.update() silently drops writes to `sessions` - Payload treats it
// as an auth-internal field, not client-writable, even with
// overrideAccess: true (confirmed live by pin-login/route.ts's own original
// author - see that route's comment on addSessionToUser).
export async function extendTillSession(payload: Payload, userId: number | string, sid: string | undefined): Promise<void> {
  if (!sid) return;
  const user = await payload.findByID({ collection: 'users', id: userId, overrideAccess: true, depth: 0 });
  const sessions = ((user.sessions ?? []) as Array<{ id: string; createdAt: string; expiresAt: string }>).map((s) =>
    s.id === sid ? { ...s, expiresAt: new Date(Date.now() + TILL_TOKEN_TTL_SECONDS * 1000) } : s,
  );
  await payload.db.updateOne({ id: userId, collection: 'users', data: { ...user, sessions }, returning: false });
}
