import config from '@payload-config';
import { randomBytes } from 'node:crypto';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { startSession } from '@/lib/sessions';

// Payload's own /admin panel (blog posts etc.) has no 2-step code field, so
// with 2-step on its login is refused. Instead an operator already signed
// into the console (password + code) asks for a one-time, 60-second
// handoff code here (POST), then their browser opens the GET link on the
// API's own domain, which sets Payload's admin cookie and goes to /admin.
const pending = new Map<string, { adminId: number | string; email: string; at: number }>();
const TTL_MS = 60_000;

export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (user?.collection !== 'platform-admins') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  for (const [k, v] of pending) if (Date.now() - v.at > TTL_MS) pending.delete(k);
  const code = randomBytes(24).toString('base64url');
  pending.set(code, { adminId: user.id, email: String(user.email), at: Date.now() });
  const base = (process.env.API_PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, '');
  return Response.json({ url: `${base}/api/platform-admin-handoff?code=${code}` });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const entry = pending.get(code);
  pending.delete(code); // one use only
  if (!entry || Date.now() - entry.at > TTL_MS) {
    return new Response('This link has expired. Open the admin panel again from the platform console.', { status: 401 });
  }
  const payload = await getPayload({ config });
  const { token, exp } = await startSession(payload, 'platform-admins', { id: entry.adminId, email: entry.email });
  const secure = (process.env.API_PUBLIC_URL || url.origin).startsWith('https://');
  const cookie = [
    `${payload.config.cookiePrefix}-token=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${new Date(exp * 1000).toUTCString()}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
  return new Response(null, { status: 302, headers: { Location: '/admin', 'Set-Cookie': cookie } });
}
