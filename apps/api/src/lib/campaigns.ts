import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Payload } from 'payload';
import { isAttentionHealth } from '@hardware-pos/business-logic';
import type { PlatformStats } from './platformStats.ts';

// Who a campaign can go to - groups that match the console's own filters.
export const SEGMENTS = {
  all_active: 'Every active shop',
  never_started: "Never made a sale (signed up 7+ days ago)",
  getting_started: 'Getting started (no sale yet, signed up this week)',
  trial: 'On a free trial',
  trial_ending: 'Trial ends within 7 days',
  slipping: 'Slipping, at risk or inactive',
  paying: 'Paying customers',
  lapsed: 'Trial ended or payment overdue',
} as const;
export type Segment = keyof typeof SEGMENTS;

export const CAMPAIGN_MAX_RECIPIENTS = 250; // Brevo free plan: 300 emails/day

type Row = PlatformStats['tenants'][number];

export function inSegment(r: Row, segment: Segment, now = new Date()): boolean {
  if (r.status !== 'active') return false;
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  switch (segment) {
    case 'all_active':
      return true;
    case 'never_started':
      return r.health.level === 'never_started';
    case 'getting_started':
      return r.health.level === 'new';
    case 'trial':
      return r.state === 'trial' || r.state === 'trial_ending';
    case 'trial_ending':
      return (r.state === 'trial' || r.state === 'trial_ending') && r.lockAt != null && r.lockAt <= weekAhead;
    case 'slipping':
      return isAttentionHealth(r.health.level) && r.health.level !== 'never_started';
    case 'paying':
      return r.state === 'paid' || r.state === 'due_soon';
    case 'lapsed':
      return r.state === 'trial_expired' || r.state === 'overdue';
  }
}

export function isSegment(v: unknown): v is Segment {
  return typeof v === 'string' && v in SEGMENTS;
}

// Signed one-click unsubscribe token: <tenantId>.<hmac>.
function sign(tenantId: number | string, secret: string): string {
  return createHmac('sha256', secret).update(`unsubscribe:${tenantId}`).digest('base64url').slice(0, 32);
}

export function unsubscribeToken(payload: Payload, tenantId: number | string): string {
  return `${tenantId}.${sign(tenantId, payload.secret)}`;
}

export function verifyUnsubscribeToken(payload: Payload, token: string): number | null {
  const [id, mac] = token.split('.');
  if (!id || !mac || !/^\d+$/.test(id)) return null;
  const expected = Buffer.from(sign(id, payload.secret));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given) ? Number(id) : null;
}

export function fillPlaceholders(text: string, r: { name: string; owner: { name: string | null } | null }): string {
  const first = r.owner?.name?.trim().split(/\s+/)[0] ?? '';
  return text.replace(/\{\{\s*shop\s*\}\}/gi, r.name).replace(/\{\{\s*owner\s*\}\}/gi, first || 'there');
}
