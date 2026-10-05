import { roundCurrency } from './money.ts';

// A promo code as stored (collections/PromoCodes.ts). Unlike discount.ts's
// older PromoCode (percentage as 0-1), `value` here is what the owner
// actually typed: KES for 'flat', 0-100 for 'percentage'.
export interface PromoRule {
  code: string;
  kind: 'flat' | 'percentage';
  value: number;
  minSpend?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  maxUses?: number | null;
  usesCount?: number | null;
  active?: boolean | null;
}

export type PromoEvaluation = { ok: true; discount: number } | { ok: false; reason: string };

// Codes are case/space-insensitive at the till ("bf 2026" == "BF2026").
export function normalizePromoCode(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

// The one place that decides whether a code applies to a basket and how
// much it takes off - used by the checkout preview on every client AND by
// the server when the order is actually created, so they can't disagree.
// `subtotal` is the basket total after per-line discounts.
export function evaluatePromo(rule: PromoRule, subtotal: number, now: Date = new Date()): PromoEvaluation {
  if (rule.active === false) return { ok: false, reason: 'This promo code is no longer active.' };
  if (rule.startsAt && now < new Date(rule.startsAt)) return { ok: false, reason: 'This promo code has not started yet.' };
  if (rule.endsAt && now > new Date(rule.endsAt)) return { ok: false, reason: 'This promo code has expired.' };
  if (rule.maxUses != null && rule.maxUses > 0 && (rule.usesCount ?? 0) >= rule.maxUses) {
    return { ok: false, reason: 'This promo code has reached its usage limit.' };
  }
  const minSpend = rule.minSpend ?? 0;
  if (minSpend > 0 && subtotal < minSpend) {
    return { ok: false, reason: `This promo code needs a minimum spend of KES ${minSpend.toLocaleString('en-KE')}.` };
  }
  if (!(rule.value > 0)) return { ok: false, reason: 'This promo code has no discount value.' };
  if (rule.kind === 'percentage' && rule.value > 100) return { ok: false, reason: 'This promo code is misconfigured.' };

  const raw = rule.kind === 'flat' ? rule.value : (subtotal * rule.value) / 100;
  return { ok: true, discount: roundCurrency(Math.max(0, Math.min(raw, subtotal))) };
}

// Loyalty points are earned at 1 point per KES 100 spent (Orders.ts) -
// computed on what the customer actually paid, after every discount.
export function loyaltyPointsEarnedFor(total: number): number {
  return Math.max(0, Math.floor(total / 100));
}

export interface LoyaltyRedemptionInput {
  requestedPoints: number;
  availablePoints: number;
  pointValue: number; // KES per point (Tenants.loyaltyPointValue)
  payable: number; // what's left to pay before redemption
}

// Whole points only, never more than the customer has, and never more than
// it takes to bring the bill to zero.
export function resolveLoyaltyRedemption(input: LoyaltyRedemptionInput): { points: number; discount: number } {
  const pointValue = input.pointValue > 0 ? input.pointValue : 0;
  if (pointValue === 0 || input.payable <= 0) return { points: 0, discount: 0 };
  const maxByBill = Math.floor(input.payable / pointValue + 1e-9);
  const points = Math.max(0, Math.floor(Math.min(input.requestedPoints || 0, input.availablePoints || 0, maxByBill)));
  return { points, discount: roundCurrency(Math.min(points * pointValue, input.payable)) };
}
