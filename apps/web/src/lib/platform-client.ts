import { getPlatformSessionToken } from './platform-session';

const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

export class PlatformApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Payload API error ${status}`);
  }
}

// Mirrors lib/payload-client.ts's payloadFetch exactly, reading the
// platform-admin's own cookie instead of the tenant one.
export async function platformFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getPlatformSessionToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `JWT ${token}`);
  }

  const response = await fetch(`${PAYLOAD_API_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PlatformApiError(response.status, body);
  }
  return body as T;
}
