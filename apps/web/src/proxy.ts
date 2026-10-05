import { NextResponse, type NextRequest } from 'next/server';
import { hasAddon, type Addon, type AddonTenant } from '@hardware-pos/business-logic';

// Presence-only check (fast, no network call) - actual token validity is
// enforced by Payload on every payloadFetch()/proxy call, which 401s and
// each dashboard page/action handles that by redirecting to /login too.
const SESSION_COOKIE = 'pos_session';

// Add-on-only dashboard routes. Without the add-on they must look exactly
// like a URL that never existed - a real 404 status, not just not-found UI
// (a page-level notFound() streams under dashboard/loading.tsx with a 200).
const ADDON_ROUTES: Array<{ prefix: string; addon: Addon }> = [{ prefix: '/dashboard/promo-codes', addon: 'sell_online' }];
const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

async function tenantHasAddon(token: string, addon: Addon): Promise<boolean | null> {
  try {
    const response = await fetch(`${PAYLOAD_API_URL}/api/users/me`, {
      headers: { Authorization: `JWT ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { user?: { tenant?: AddonTenant | number } | null };
    const tenant = body.user?.tenant;
    return typeof tenant === 'object' && tenant !== null ? hasAddon(tenant, addon) : null;
  } catch {
    // Can't tell (API unreachable) - let the page's own notFound() guard decide.
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (request.nextUrl.pathname.startsWith('/dashboard') && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  const gated = ADDON_ROUTES.find((route) => request.nextUrl.pathname.startsWith(route.prefix));
  if (gated && hasSession) {
    const allowed = await tenantHasAddon(request.cookies.get(SESSION_COOKIE)!.value, gated.addon);
    if (allowed === false) {
      return NextResponse.rewrite(new URL('/dashboard/__not-found', request.url));
    }
  }
  if (request.nextUrl.pathname === '/login' && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
