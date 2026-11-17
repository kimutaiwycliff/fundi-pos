import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { allow } from '@/lib/rateLimit';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '@/lib/totp';

// PLATFORM-ADMIN ONLY. 2-step sign-in for the console (authenticator app).
//   GET                         -> { enabled }
//   POST {action:'setup'}       -> new secret + otpauth:// URL (QR) - pending until confirmed
//   POST {action:'enable', code}  confirms the pending secret with a current code
//   POST {action:'disable', code} turns it off (needs a current code)
export async function GET() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (user?.collection !== 'platform-admins') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ enabled: Boolean(user.totpEnabled) });
}

export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (user?.collection !== 'platform-admins') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { action, code } = (await request.json().catch(() => ({}))) as { action?: string; code?: string };
  const me = await payload.findByID({ collection: 'platform-admins', id: user.id, depth: 0, overrideAccess: true, showHiddenFields: true });
  const update = (data: Record<string, unknown>) => payload.update({ collection: 'platform-admins', id: user.id, data, overrideAccess: true });

  if (action === 'setup') {
    if (me.totpEnabled) return Response.json({ error: '2-step sign-in is already on.' }, { status: 409 });
    const secret = generateTotpSecret();
    await update({ totpPendingSecret: secret });
    return Response.json({ secret, otpauthUrl: otpauthUrl(secret, String(me.email)) });
  }
  if (!allow(`2fa-manage:${user.id}`, 10, 15 * 60 * 1000)) return Response.json({ error: 'Too many attempts - wait 15 minutes.' }, { status: 429 });
  if (action === 'enable') {
    if (!me.totpPendingSecret || !verifyTotp(String(me.totpPendingSecret), String(code ?? ''))) {
      return Response.json({ error: 'That code is wrong or has expired - check the app and try again.' }, { status: 400 });
    }
    await update({ totpSecret: me.totpPendingSecret, totpPendingSecret: null, totpEnabled: true });
    return Response.json({ enabled: true });
  }
  if (action === 'disable') {
    if (!me.totpEnabled || !me.totpSecret || !verifyTotp(String(me.totpSecret), String(code ?? ''))) {
      return Response.json({ error: 'That code is wrong or has expired.' }, { status: 400 });
    }
    await update({ totpSecret: null, totpEnabled: false });
    return Response.json({ enabled: false });
  }
  return Response.json({ error: 'action must be setup, enable or disable' }, { status: 400 });
}
