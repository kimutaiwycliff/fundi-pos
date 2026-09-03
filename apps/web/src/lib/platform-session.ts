import { cookies } from 'next/headers';

// Mirrors lib/session.ts exactly, but under a DIFFERENT cookie name - a
// platform-admin session and a tenant-user session must never collide if
// the same browser somehow holds both (e.g. the platform operator also
// running their own tenant for testing). Sharing pos_session would mean
// whichever login happened most recently silently overwrites the other's
// identity.
const COOKIE_NAME = 'platform_session';

export async function getPlatformSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function setPlatformSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 2,
  });
}

export async function clearPlatformSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
