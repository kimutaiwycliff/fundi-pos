import { setPlatformSessionCookie } from '@/lib/platform-session';

const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

// Mirrors app/api/auth/login/route.ts exactly, against the platform-admins
// collection's own login endpoint instead of users.
export async function POST(request: Request) {
  const { email, password } = await request.json();

  const response = await fetch(`${PAYLOAD_API_URL}/api/platform-admins/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.token) {
    return Response.json({ error: body?.errors?.[0]?.message ?? 'Login failed' }, { status: response.status || 401 });
  }

  await setPlatformSessionCookie(body.token);
  return Response.json({ user: body.user });
}
