import { getSessionToken } from '@/lib/session';

const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

// Not handled by the generic /api/payload/[...path] proxy - that one always
// re-serializes the body as JSON, which would corrupt a multipart file
// upload. This forwards the browser's FormData through untouched.
export async function POST(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const response = await fetch(`${PAYLOAD_API_URL}/api/products/bulk-upload`, {
    method: 'POST',
    headers: { Authorization: `JWT ${token}` },
    body: formData,
  });

  const body = await response.text();
  return new Response(body, { status: response.status, headers: { 'Content-Type': 'application/json' } });
}
