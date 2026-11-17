import config from '@payload-config';
import { getPayload } from 'payload';
import { sendPasswordReset } from '@/lib/notifications';
import { allow } from '@/lib/rateLimit';
import { createSetPasswordLink } from '@/lib/setPasswordLink';
import { clientIp } from '@/lib/trialGrants';

// "Forgot password?" for shop staff with an email login. Always answers the
// same way whether or not the email exists (no account fishing), and is
// rate-limited per email and per IP.
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { email: raw } = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const done = Response.json({ ok: true });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'Enter your email address.' }, { status: 400 });
  const ip = clientIp(request.headers) ?? 'unknown';
  if (!allow(`forgot:ip:${ip}`, 10, 60 * 60 * 1000) || !allow(`forgot:email:${email}`, 3, 60 * 60 * 1000)) {
    return Response.json({ error: 'Too many requests - try again in an hour.' }, { status: 429 });
  }

  const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true });
  const user = found.docs[0];
  if (!user || user.status === 'banned') return done;
  const link = await createSetPasswordLink(payload, email);
  await sendPasswordReset(payload, { userId: user.id, email, name: (user.name as string) ?? null, link });
  return done;
}
