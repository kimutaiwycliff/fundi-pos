import config from '@payload-config';
import { getPayload } from 'payload';
import { addSessionToUser } from 'payload/shared';
import { SignJWT } from 'jose';
import { verifyPin } from '@/lib/pin';
import { checkBillingStatus } from '@/lib/billing';
import { toID } from '@/lib/relations';

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
  rateLimiter.delete(phone);

  const tenant = await payload.findByID({ collection: 'tenants', id: toID(user.tenant), overrideAccess: true });
  const billing = checkBillingStatus(tenant.billingStatus);
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

  const issuedAt = Math.floor(Date.now() / 1000);
  const tokenExpiration = collectionConfig.auth.tokenExpiration ?? 2 * 60 * 60;
  const exp = issuedAt + tokenExpiration;
  // payload.secret, not process.env.PAYLOAD_SECRET directly - Payload's own
  // verification (auth/strategies/jwt.js) signs/checks against this exact
  // value, and nothing guarantees it's untransformed from the raw env var.
  const secret = new TextEncoder().encode(payload.secret);
  // Header must include typ: 'JWT' - Payload's own jwtSign() does, and a
  // token missing it was silently rejected by the JWT auth strategy
  // (confirmed live: /api/users/me came back { user: null } with it absent).
  const token = await new SignJWT({ id: user.id, collection: 'users', email: user.email, sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(exp)
    .sign(secret);

  return Response.json({ token, exp, user });
}
