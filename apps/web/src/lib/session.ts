import { cookies } from 'next/headers';

// Payload's own JWT, held in an httpOnly cookie scoped to apps/web's own
// origin (set by our /api/auth/login route below) - never exposed to
// client-side JS. This is a deliberate proxy pattern: the browser is only
// ever same-origin with apps/web, sidestepping cross-origin cookie
// SameSite/Secure complications that a direct browser->Payload cookie flow
// would hit under local http (non-TLS) dev.
const COOKIE_NAME = 'pos_session';

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 2, // Payload's own default token TTL is 2 hours
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
