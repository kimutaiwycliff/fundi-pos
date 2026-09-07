const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

export class PayloadApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Payload API error ${status}`);
  }
}

// Sibling to payload-client.ts's payloadFetch, but for genuinely PUBLIC,
// unauthenticated content (blog posts) - deliberately does NOT read the
// session cookie (this runs on pages anonymous visitors load, so there's no
// reason to pay the cookie-read cost or send an Authorization header), and
// unlike payloadFetch's hardcoded `cache: 'no-store'`, this is cacheable -
// public blog content doesn't change per-request, so ISR-style revalidation
// is correct here where it would be wrong for tenant-scoped dashboard data.
export async function payloadPublicFetch<T = unknown>(path: string, revalidateSeconds = 300): Promise<T> {
  const response = await fetch(`${PAYLOAD_API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: revalidateSeconds },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PayloadApiError(response.status, body);
  }
  return body as T;
}
