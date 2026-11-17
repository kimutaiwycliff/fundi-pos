import { setSessionCookie } from '@/lib/session';
import { appOrigin, cookieFlags, OAUTH_COOKIE, PAYLOAD_API_URL, readCookie, redirectUri, SIGNUP_COOKIE } from '@/lib/google-oauth';

// Step 2: Google sends the user back with a code. Swap it for an ID token,
// let the API decide: existing account -> signed in; new -> shop-name step.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = appOrigin(request);
  const fail = (reason: string) =>
    new Response(null, {
      status: 302,
      headers: { Location: `${origin}/login?error=${encodeURIComponent(reason)}`, 'Set-Cookie': `${OAUTH_COOKIE}=; ${cookieFlags(0, request)}` },
    });

  let saved: { state?: string; nonce?: string } = {};
  try {
    saved = JSON.parse(readCookie(request, OAUTH_COOKIE) ?? '{}');
  } catch {
    saved = {};
  }
  if (url.searchParams.get('error')) return fail('google_cancelled');
  const code = url.searchParams.get('code');
  if (!code || !saved.state || url.searchParams.get('state') !== saved.state) return fail('google_expired');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: String(process.env.GOOGLE_CLIENT_ID),
      client_secret: String(process.env.GOOGLE_CLIENT_SECRET),
      redirect_uri: redirectUri(request),
      grant_type: 'authorization_code',
    }),
  });
  const tokens = (await tokenResponse.json().catch(() => ({}))) as { id_token?: string };
  if (!tokenResponse.ok || !tokens.id_token) return fail('google_failed');

  const apiResponse = await fetch(`${PAYLOAD_API_URL}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Fundi-Client': 'web' },
    body: JSON.stringify({ idToken: tokens.id_token, nonce: saved.nonce }),
  });
  const result = (await apiResponse.json().catch(() => ({}))) as { token?: string; signupToken?: string; error?: string };
  if (!apiResponse.ok) return fail(result.error ?? 'google_failed');

  const headers = new Headers({ Location: `${origin}/dashboard` });
  headers.append('Set-Cookie', `${OAUTH_COOKIE}=; ${cookieFlags(0, request)}`);
  if (result.token) {
    await setSessionCookie(result.token);
    return new Response(null, { status: 302, headers });
  }
  if (result.signupToken) {
    headers.set('Location', `${origin}/signup/google`);
    headers.append('Set-Cookie', `${SIGNUP_COOKIE}=${encodeURIComponent(result.signupToken)}; ${cookieFlags(1200, request)}`);
    return new Response(null, { status: 302, headers });
  }
  return fail('google_failed');
}
