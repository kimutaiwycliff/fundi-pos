// "Continue with Google" - the OAuth redirect half (apps/api verifies the
// ID token and owns accounts). GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from
// a Google Cloud OAuth client ("Web application") whose authorised redirect
// URI is <APP_URL>/api/auth/google/callback.
export const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';
export const OAUTH_COOKIE = 'g_oauth';
export const SIGNUP_COOKIE = 'g_signup';

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// The public origin users see (behind Caddy the request URL is internal).
export function appOrigin(request: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host;
  return `${proto}://${host}`;
}

export function redirectUri(request: Request): string {
  return `${appOrigin(request)}/api/auth/google/callback`;
}

export function cookieFlags(maxAgeSeconds: number, request: Request): string {
  const secure = appOrigin(request).startsWith('https://') ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function readCookie(request: Request, name: string): string | null {
  const match = (request.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}
