import { setSessionCookie } from '@/lib/session';

const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

export async function POST(request: Request) {
  const { email, password } = await request.json();

  const response = await fetch(`${PAYLOAD_API_URL}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.token) {
    return Response.json({ error: body?.errors?.[0]?.message ?? 'Login failed' }, { status: response.status || 401 });
  }

  await setSessionCookie(body.token);
  return Response.json({ user: body.user });
}
