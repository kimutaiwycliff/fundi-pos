import { setPlatformSessionCookie } from '@/lib/platform-session';

const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

// Mirrors app/api/auth/login/route.ts exactly, against the platform-admins
// collection's own login endpoint instead of users.
export async function POST(request: Request) {
  const { email, password, totp } = await request.json();

  const response = await fetch(`${PAYLOAD_API_URL}/api/platform-admins/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // totp: the 2-step code, when the operator has 2-step sign-in on.
    body: JSON.stringify({ email, password, ...(totp ? { totp: String(totp) } : {}) }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.token) {
    const error: string = body?.errors?.[0]?.message ?? 'Login failed';
    // apps/api lib/totp.ts TOTP_REQUIRED_MESSAGE - password was right, now ask for the code.
    const needsCode = error.startsWith('Enter the 6-digit code');
    return Response.json({ error, needsCode }, { status: response.status || 401 });
  }

  await setPlatformSessionCookie(body.token);
  return Response.json({ user: body.user });
}
