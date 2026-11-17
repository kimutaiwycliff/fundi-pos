import { setSessionCookie } from '@/lib/session';
import { cookieFlags, PAYLOAD_API_URL, readCookie, SIGNUP_COOKIE } from '@/lib/google-oauth';

// Step 3 (first-time Google users only): the shop name -> shop + owner created, signed in.
export async function POST(request: Request) {
  const signupToken = readCookie(request, SIGNUP_COOKIE);
  if (!signupToken) return Response.json({ error: 'This sign-up has expired - continue with Google again.' }, { status: 401 });
  const { businessName } = (await request.json().catch(() => ({}))) as { businessName?: string };
  const apiResponse = await fetch(`${PAYLOAD_API_URL}/api/auth/google/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Fundi-Client': 'web', 'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '' },
    body: JSON.stringify({ signupToken, businessName }),
  });
  const body = (await apiResponse.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!apiResponse.ok || !body.token) return Response.json({ error: body.error ?? 'Could not create your shop' }, { status: apiResponse.status || 400 });
  await setSessionCookie(body.token);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': `${SIGNUP_COOKIE}=; ${cookieFlags(0, request)}` },
  });
}
