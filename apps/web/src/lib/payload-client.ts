import { getSessionToken } from './session';

const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

export class PayloadApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Payload API error ${status}`);
  }
}

// Server-only fetch wrapper for Server Components / route handlers - runs
// server-to-server (no CORS involved), attaching the session token read
// from our own httpOnly cookie via the `Authorization: JWT <token>` scheme
// Payload's REST API expects.
export async function payloadFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getSessionToken();
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
    throw new PayloadApiError(response.status, body);
  }
  return body as T;
}
