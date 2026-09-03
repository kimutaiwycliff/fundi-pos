import { getPlatformSessionToken } from '@/lib/platform-session';

const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

// Mirrors app/api/payload/[...path]/route.ts exactly, authenticating with
// the platform-admin's own cookie instead - so client components on the
// platform pages can PATCH e.g. /api/platform/tenants/:id the same way the
// tenant dashboard's own client components already call /api/payload/*.
async function proxy(request: Request, path: string[]) {
  const token = await getPlatformSessionToken();
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
  const body = await response.text();
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
