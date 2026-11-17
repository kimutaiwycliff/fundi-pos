import type { Payload } from 'payload';

// A one-time "choose your password" link for a tenant user, built on
// Payload's forgot-password token (valid 72h - Users.ts). Opens apps/web's
// /set-password page.
export async function createSetPasswordLink(payload: Payload, email: string): Promise<string> {
  const token = await payload.forgotPassword({ collection: 'users', data: { email }, disableEmail: true, overrideAccess: true });
  if (!token) throw new Error('Could not create a set-password link');
  const base = (process.env.APP_URL || 'https://app.fundipos.co.ke').replace(/\/$/, '');
  return `${base}/set-password?token=${encodeURIComponent(String(token))}`;
}
