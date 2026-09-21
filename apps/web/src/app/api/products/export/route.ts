import { getSessionToken } from '@/lib/session';

const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

// Streams the binary .xlsx through - same pattern as bulk-upload/template's
// own proxy, the generic proxy assumes JSON bodies.
export async function GET() {
  const token = await getSessionToken();
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const response = await fetch(`${PAYLOAD_API_URL}/api/products/export`, {
    headers: { Authorization: `JWT ${token}` },
  });

  const buffer = await response.arrayBuffer();
  return new Response(buffer, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/octet-stream',
      'Content-Disposition': response.headers.get('Content-Disposition') ?? 'attachment; filename="products-export.xlsx"',
    },
  });
}
