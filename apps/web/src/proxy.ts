import { NextResponse, type NextRequest } from 'next/server';

// Presence-only check (fast, no network call) - actual token validity is
// enforced by Payload on every payloadFetch()/proxy call, which 401s and
// each dashboard page/action handles that by redirecting to /login too.
const SESSION_COOKIE = 'pos_session';

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (request.nextUrl.pathname.startsWith('/dashboard') && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (request.nextUrl.pathname === '/login' && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
