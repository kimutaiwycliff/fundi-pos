import { clearPlatformSessionCookie } from '@/lib/platform-session';

export async function POST() {
  await clearPlatformSessionCookie();
  return Response.json({ ok: true });
}
