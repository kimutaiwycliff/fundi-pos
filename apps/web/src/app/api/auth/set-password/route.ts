import { setSessionCookie } from '@/lib/session';

const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

// Finishes a set-password link (an owner the platform operator added, see
// apps/api platform-provision): hands the token + new password to Payload's
// reset-password endpoint, which also logs them in - so we set the session
// cookie and they land straight on the dashboard.
export async function POST(request: Request) {
  const { token, password } = (await request.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!token) return Response.json({ error: 'This link is missing its code - ask for a new one.' }, { status: 400 });
  if (!password || password.length < 8) return Response.json({ error: 'Use at least 8 characters.' }, { status: 400 });

  const response = await fetch(`${PAYLOAD_API_URL}/api/users/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Fundi-Client': 'web' },
    body: JSON.stringify({ token, password }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.token) {
    return Response.json(
      { error: 'This link has expired or was already used. Ask Fundi POS for a new one.' },
      { status: response.status >= 400 && response.status < 500 ? response.status : 400 },
    );
  }
  await setSessionCookie(body.token);
  return Response.json({ ok: true });
}
