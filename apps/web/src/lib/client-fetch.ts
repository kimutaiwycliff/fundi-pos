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

/**
 * Drop-in for `fetch` that turns a connectivity-layer failure into a
 * friendly, consistent Error instead of the raw one the browser produces.
 * An HTTP error response (4xx/5xx) still resolves normally - every existing
 * `if (!res.ok)` call site keeps working unchanged.
 */
export async function clientFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }
}

/** Normalizes this app's two error-body shapes into one message string. */
export function errorMessageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as { errors?: Array<{ message?: string }>; error?: string };
    return b.errors?.[0]?.message ?? b.error ?? fallback;
  }
  return fallback;
}
