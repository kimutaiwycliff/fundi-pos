import config from '@payload-config';
import { getPayload } from 'payload';
import { addSessionToUser } from 'payload/shared';
import { verifyPin } from '@/lib/pin';
import { checkTenantAccess } from '@/lib/billing';
import { toID } from '@/lib/relations';
import { extendTillSession, mintTillToken } from '@/lib/tillAuth';

// Fast till login: phone + PIN instead of email + password (the web
// dashboard keeps email/password - Payload's auth strategy is built around
// it, and PINs are far weaker for protecting back-office/financial screens).
// This still requires connectivity - it mints a real, fresh Payload session
// the same way /api/users/login does, which the till then uses for
// PowerSync auth exactly like a password login. Fully-offline PIN
// re-entry for an ALREADY-connected till session is a different, already-
// solved problem - see apps/desktop/src/pin.ts's cashier-switching flow,
// which never touches the network at all.
//
// A network-reachable PIN endpoint is a materially different threat model
// than the offline-only Rust PIN check (lib/pin.rs) - that one requires
// physical possession of an already-logged-in till; this one only requires
// knowing someone's phone number. Rate-limited per phone accordingly.
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;

function checkRateLimit(phone: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(phone);
  if (!entry || entry.resetAt < now) {
    rateLimiter.set(phone, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

export async function POST(request: Request) {
  const { phone, pin } = await request.json().catch(() => ({}));
  if (typeof phone !== 'string' || typeof pin !== 'string' || !phone || !pin) {
    return Response.json({ error: 'phone and pin are required' }, { status: 400 });
  }

  if (!checkRateLimit(phone)) {
    return Response.json({ error: 'Too many attempts - try again in a few minutes' }, { status: 429 });
  }

  const payload = await getPayload({ config });
  const matches = await payload.find({
    collection: 'users',
    where: { phone: { equals: phone } },
    limit: 1,
    overrideAccess: true,
  });
  const user = matches.docs[0];

  if (!user || !user.pinHash || !verifyPin(pin, user.pinHash)) {
    return Response.json({ error: 'Invalid phone or PIN' }, { status: 401 });
  }
  // This route mints a session directly rather than calling payload.login(),
  // so Users.ts's own beforeLogin/afterLogin hooks (which have this same
  // check, and the login audit write below) never run for it - both have
  // to be re-done here explicitly.
  if (user.status === 'banned') {
    await payload.create({
      collection: 'audit-log',
      overrideAccess: true,
      data: {
        tenant: Number(toID(user.tenant)),
        actor: Number(user.id),
        action: 'login_blocked',
        entityType: 'user',
        entityId: String(user.id),
        summary: `${user.name || user.email} attempted to log in (till) while banned`,
      },
    });
    return Response.json({ error: 'This account has been disabled. Contact your manager or owner.' }, { status: 403 });
  }
  rateLimiter.delete(phone);

  const tenant = await payload.findByID({ collection: 'tenants', id: toID(user.tenant), overrideAccess: true });
  const billing = checkTenantAccess(tenant);
  if (!billing.allowed) {
    return Response.json({ error: billing.message }, { status: 403 });
  }

  // Payload 3.x tracks sessions server-side (revocable, not just a
  // stateless JWT) - a session pushed via a normal payload.update() call is
  // silently dropped (Payload treats `sessions` as an auth-internal field,
  // not a client-writable one, even with overrideAccess: true - confirmed
  // live: the array stayed empty and the resulting token was rejected).
  // addSessionToUser is the actual internal function payload.login() calls,
  // exported from payload/shared for exactly this kind of custom-strategy
  // use case, and writes via payload.db.updateOne() directly.
  const collectionConfig = payload.collections.users.config;
  const { sid } = await addSessionToUser({
    collectionConfig,
    payload,
    // No real Express/Next request object exists in this custom route -
    // addSessionToUser only forwards it to payload.db.updateOne() for
    // transaction context, which tolerates undefined outside a transaction.
    req: undefined as unknown as Parameters<typeof addSessionToUser>[0]['req'],
    user,
  });
  if (!sid) {
    // Users.ts's auth config always has useSessions: true (Payload's own
    // default) - addSessionToUser only ever returns an undefined sid when
    // that's false, so this should be unreachable in practice.
    return Response.json({ error: 'Could not start a session' }, { status: 500 });
  }

  // addSessionToUser above sized this session's own expiresAt off the
  // shared collectionConfig.auth.tokenExpiration (2h, same as the web
  // dashboard) - tills get a much longer-lived one instead, to support
  // fully offline operation once initially connected (see tillAuth.ts).
  await extendTillSession(payload, user.id, sid);
  const { token, exp } = await mintTillToken(payload, { id: user.id, email: user.email, sid });

  await payload.create({
    collection: 'audit-log',
    overrideAccess: true,
    data: {
      tenant: Number(toID(user.tenant)),
      actor: Number(user.id),
      action: 'login',
      entityType: 'user',
      entityId: String(user.id),
      summary: `${user.name || user.email} logged in (till)`,
    },
  });

  return Response.json({ token, exp, user });
}
