// Shared helper for client-side ('use client') components calling this
// app's own /api/* routes (both the /api/payload/* proxy and custom routes
// like /api/orders/[id]/authorize-status). Two problems showed up
// repeatedly across dashboard dialogs before this existed: (1) a raw
// network failure (offline, DNS, timeout - the browser's fetch() rejecting
// before any Response comes back) was either uncaught entirely (leaving a
// "Saving..." button stuck forever, since the code after the `await` never
// ran) or caught and shown as a raw browser string ("Failed to fetch"); (2)
// the two different error-body shapes this app's routes return -
// `{errors:[{message}]}` from Payload's own REST API (proxied verbatim) vs
// `{error}` from hand-written routes - were normalized ad hoc, differently,
// in almost every file.

export const OFFLINE_MESSAGE = "You're offline. Check your connection and try again.";

// Guards against every in-flight request that 401s at roughly the same
// moment (a page with several concurrent calls) each independently trying
// to log out/redirect - only the first one actually does anything, since
// by the time the others' responses come back the redirect is already
// under way.
let redirectingToLogin = false;

// A genuinely-expired/invalid Payload session (401) should sign the user
// out and send them back to /login instead of leaving them on the page to
// hit a raw 401 on every subsequent action - see getCurrentUser()
// (current-user.ts) for the equivalent server-side-navigation redirect this
// mirrors for client-side actions. Deliberately 401-only, never 403: a 403
// means an authenticated-but-not-permitted action (e.g. a cashier hitting a
// manager-only field), which is a normal, expected outcome for a perfectly
// valid session and must never force a logout.
function triggerSessionExpiredRedirect() {
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  // Plain fetch, not clientFetch - must not recurse back into this file's
  // own 401 handling. Same cookie-clearing route the manual "Log out"
  // button (use-logout.ts) already uses; the redirect fires either way so a
  // failed logout call itself can never get in the way of it.
  fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
    // A full reload, not router.push - this function has no React/router
    // context to call into (it's invoked from a plain utility, not a
    // component), and a hard navigation is the right call anyway: it
    // guarantees every component still holding stale, now-unauthenticated
    // state gets torn down, rather than a client-side transition leaving
    // some of that in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login?expired=1';
  });
}

/**
 * Drop-in for `fetch` that turns a connectivity-layer failure into a
 * friendly, consistent Error instead of the raw one the browser produces.
 * An HTTP error response (4xx/5xx) still resolves normally - every existing
 * `if (!res.ok)` call site keeps working unchanged.
 *
 * Also watches for a 401 (session actually expired/invalid) and triggers a
 * logout+redirect to /login - pass `{ skipSessionRedirect: true }` from a
 * pre-auth call site (e.g. the login form's own submit) where a 401 means
 * "wrong credentials", not "your existing session died".
 */
export async function clientFetch(input: string, init?: RequestInit, options?: { skipSessionRedirect?: boolean }): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }
  if (response.status === 401 && !options?.skipSessionRedirect) {
    triggerSessionExpiredRedirect();
  }
  return response;
}

/** Normalizes this app's two error-body shapes into one message string. */
export function errorMessageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as { errors?: Array<{ message?: string }>; error?: string };
    return b.errors?.[0]?.message ?? b.error ?? fallback;
  }
  return fallback;
}
