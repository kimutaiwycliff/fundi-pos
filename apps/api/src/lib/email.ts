import type { Payload } from 'payload';

// Transactional email through Brevo's HTTP API (https://api.brevo.com -
// HTTP rather than SMTP so a VPS that blocks outbound mail ports doesn't
// matter). Without BREVO_API_KEY (local dev, tests) nothing is sent: the
// message is printed and recorded with status "logged".
//
// Every message is recorded in platform-notifications under a unique key
// BEFORE it's sent; if that key already exists the send is skipped. That's
// what makes scheduled reminders safe to re-run.

export interface OutgoingEmail {
  key: string;
  kind: string;
  tenantId?: number | string | null;
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
}

export type SendResult = 'sent' | 'logged' | 'failed' | 'duplicate' | 'no_recipient';

export function emailSettings() {
  return {
    apiKey: process.env.BREVO_API_KEY || '',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'billing@fundipos.co.ke',
    fromName: process.env.EMAIL_FROM_NAME || 'Fundi POS',
    replyTo: process.env.EMAIL_REPLY_TO || '',
  };
}

function isUniqueViolation(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${(err as { cause?: { code?: string } }).cause?.code ?? ''}` : String(err);
  return /unique|duplicate|23505/i.test(text) || (err as { data?: { errors?: { path?: string }[] } })?.data?.errors?.some((e) => e.path === 'key') === true;
}

export async function sendEmail(payload: Payload, email: OutgoingEmail): Promise<SendResult> {
  const to = [...new Set(email.to.map((t) => t.trim().toLowerCase()).filter((t) => /.+@.+\..+/.test(t)))];
  if (to.length === 0) return 'no_recipient';
  const settings = emailSettings();

  let record: { id: number | string };
  try {
    record = await payload.create({
      collection: 'platform-notifications',
      overrideAccess: true,
      data: {
        tenant: email.tenantId != null ? Number(email.tenantId) : undefined,
        kind: email.kind,
        key: email.key,
        to: to.join(', '),
        subject: email.subject,
        status: settings.apiKey ? 'failed' : 'logged',
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return 'duplicate';
    throw err;
  }

  if (!settings.apiKey) {
    console.info(`[email:logged] ${email.kind} -> ${to.join(', ')}: ${email.subject}`);
    return 'logged';
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': settings.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: settings.fromName, email: settings.fromAddress },
        to: to.map((address) => ({ email: address })),
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
        ...(email.replyTo || settings.replyTo ? { replyTo: { email: email.replyTo || settings.replyTo } } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => ({}))) as { messageId?: string; message?: string };
    if (!response.ok) throw new Error(`Brevo ${response.status}: ${body.message ?? 'rejected'}`);
    await payload.update({
      collection: 'platform-notifications',
      id: record.id,
      overrideAccess: true,
      data: { status: 'sent', providerId: body.messageId ?? null },
    });
    return 'sent';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[email:failed] ${email.kind} -> ${to.join(', ')}: ${message}`);
    await payload
      // Free the key so the next scheduled run retries; keep the failed
      // attempt on record for the tenant page's "Emails" list.
      .update({
        collection: 'platform-notifications',
        id: record.id,
        overrideAccess: true,
        data: { status: 'failed', error: message.slice(0, 500), key: `${email.key}:failed:${Date.now()}` },
      })
      .catch(() => null);
    return 'failed';
  }
}
