const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL ?? 'http://localhost:3011';

// Pass-through to apps/api's forgot-password (rate limits + the email).
export async function POST(request: Request) {
  const response = await fetch(`${PAYLOAD_API_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '' },
    body: await request.text(),
  });
  return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json' } });
}
