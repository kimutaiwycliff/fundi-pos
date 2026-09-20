import { getSessionToken } from '@/lib/session';

const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

// Thin authenticated proxy so client components can create/update/delete
// through Payload's REST API without ever holding the session token
// themselves - only server code (this route, payload-client.ts) ever reads
// the httpOnly cookie.
async function proxy(request: Request, path: string[]) {
  const token = await getSessionToken();
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const target = `${PAYLOAD_API_URL}/api/${path.join('/')}${url.search}`;

  const init: RequestInit = {
    method: request.method,
    headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` },
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }

  const response = await fetch(target, init);
  // arrayBuffer (not .text()) so binary responses - e.g. the invoice-pdf
  // route's application/pdf body - pass through byte-for-byte instead of
  // being corrupted by a UTF-8 text decode/re-encode round trip. Works
  // identically for JSON bodies too, since Response accepts either.
  const body = await response.arrayBuffer();
  return new Response(body, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await params).path);
}
export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await params).path);
}
export async function PATCH(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await params).path);
}
export async function DELETE(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await params).path);
}
