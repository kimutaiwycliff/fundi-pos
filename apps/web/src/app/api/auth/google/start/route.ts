import { randomBytes } from 'node:crypto';
import { cookieFlags, googleConfigured, OAUTH_COOKIE, redirectUri, appOrigin } from '@/lib/google-oauth';

// Step 1: off to Google's account picker. state (CSRF) and nonce (replay)
// ride in a short httpOnly cookie and are checked on the way back.
export function GET(request: Request) {
  if (!googleConfigured()) return Response.redirect(`${appOrigin(request)}/login?error=google_unavailable`, 302);
  const state = randomBytes(16).toString('base64url');
  const nonce = randomBytes(16).toString('base64url');
  const params = new URLSearchParams({
    client_id: String(process.env.GOOGLE_CLIENT_ID),
    redirect_uri: redirectUri(request),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      'Set-Cookie': `${OAUTH_COOKIE}=${encodeURIComponent(JSON.stringify({ state, nonce }))}; ${cookieFlags(600, request)}`,
    },
  });
}
