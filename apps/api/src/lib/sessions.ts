import { SignJWT } from 'jose';
import type { Payload } from 'payload';
import { addSessionToUser } from 'payload/shared';

// Start a real Payload session for a user who signed in some other way than
// email + password (Google, the console's 2-step handoff into /admin) and
// sign the JWT Payload's own auth strategy accepts. Same mechanism as
// app/api/auth/pin-login (see its comments for why addSessionToUser).
export async function startSession(
  payload: Payload,
  collection: 'users' | 'platform-admins',
  user: { id: number | string; email: string },
  ttlSeconds = 2 * 60 * 60,
): Promise<{ token: string; exp: number }> {
  // addSessionToUser writes the whole user row back (an upsert), so it needs
  // the complete document - hidden fields included, or they'd be blanked.
  const full = await payload.findByID({ collection, id: user.id, depth: 0, overrideAccess: true, showHiddenFields: true });
  const { sid } = await addSessionToUser({
    collectionConfig: payload.collections[collection].config,
    payload,
    req: undefined as unknown as Parameters<typeof addSessionToUser>[0]['req'],
    user: full as unknown as Parameters<typeof addSessionToUser>[0]['user'],
  });
  if (!sid) throw new Error('Could not start a session');
  const issuedAt = Math.floor(Date.now() / 1000);
  const exp = issuedAt + ttlSeconds;
  // typ: 'JWT' is required - Payload's JWT strategy rejects tokens without it.
  const token = await new SignJWT({ id: user.id, collection, email: user.email, sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(payload.secret));
  return { token, exp };
}
