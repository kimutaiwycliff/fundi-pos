import type { Payload, Where } from 'payload';
import { normalizeKenyanPhone } from '@hardware-pos/business-logic';

// Repeat-trial detection (collections/TrialGrants.ts).

// gmail/googlemail ignore dots and +tags; everyone ignores +tags and case.
export function canonicalEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (!local || !domain) return null;
  let user = local.split('+')[0];
  const d = domain === 'googlemail.com' ? 'gmail.com' : domain;
  if (d === 'gmail.com') user = user.replace(/\./g, '');
  return `${user}@${d}`;
}

function canonicalPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  try {
    return normalizeKenyanPhone(phone) || null;
  } catch {
    return null;
  }
}

export interface PriorTrial {
  id: number;
  tenant: number | null;
  businessName: string;
  createdAt: string;
  matchedOn: ('email' | 'phone' | 'ip' | 'google')[];
}

export async function findPriorTrials(
  payload: Payload,
  q: { email?: string | null; phone?: string | null; ip?: string | null; googleSub?: string | null; excludeTenantId?: number | string | null },
): Promise<PriorTrial[]> {
  const email = canonicalEmail(q.email);
  const phone = canonicalPhone(q.phone);
  const or: Where[] = [
    ...(email ? [{ emailCanonical: { equals: email } }] : []),
    ...(phone ? [{ phone: { equals: phone } }] : []),
    ...(q.ip ? [{ ip: { equals: q.ip } }] : []),
    ...(q.googleSub ? [{ googleSub: { equals: q.googleSub } }] : []),
  ];
  if (or.length === 0) return [];
  const found = await payload.find({ collection: 'trial-grants', where: { or }, sort: 'createdAt', limit: 20, depth: 0, overrideAccess: true });
  return found.docs
    .filter((g) => q.excludeTenantId == null || g.tenant == null || Number(g.tenant) !== Number(q.excludeTenantId))
    .map((g) => ({
      id: Number(g.id),
      tenant: g.tenant != null ? Number(g.tenant) : null,
      businessName: String(g.businessName),
      createdAt: String(g.createdAt),
      matchedOn: [
        ...(email && g.emailCanonical === email ? (['email'] as const) : []),
        ...(phone && g.phone === phone ? (['phone'] as const) : []),
        ...(q.ip && g.ip === q.ip ? (['ip'] as const) : []),
        ...(q.googleSub && g.googleSub === q.googleSub ? (['google'] as const) : []),
      ],
    }));
}

export async function recordTrialGrant(
  payload: Payload,
  g: { tenantId: number | string; businessName: string; email?: string | null; phone?: string | null; ip?: string | null; googleSub?: string | null; source: 'signup' | 'operator'; trialDays: number; repeatOverride?: boolean },
): Promise<void> {
  await payload.create({
    collection: 'trial-grants',
    overrideAccess: true,
    data: {
      tenant: Number(g.tenantId),
      businessName: g.businessName,
      emailCanonical: canonicalEmail(g.email),
      emailRaw: g.email ?? null,
      phone: canonicalPhone(g.phone),
      ip: g.ip ?? null,
      googleSub: g.googleSub ?? null,
      source: g.source,
      trialDays: g.trialDays,
      repeatOverride: g.repeatOverride ?? false,
    },
  });
}

export function clientIp(headers: Headers | null | undefined): string | null {
  const fwd = headers?.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || headers?.get('x-real-ip') || null;
}
