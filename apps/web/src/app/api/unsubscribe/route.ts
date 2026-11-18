const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

// Public pass-through for the campaign unsubscribe link (apps/api
// /api/unsubscribe checks the signed token).
export async function POST(request: Request) {
  const response = await fetch(`${PAYLOAD_API_URL}/api/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await request.text(),
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
  });
}
