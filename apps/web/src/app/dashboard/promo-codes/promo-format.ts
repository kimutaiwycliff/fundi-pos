import { formatDate } from '@/lib/format-date';

// Shape of a promo-codes doc as this page reads it (depth=1, so
// referrerCustomer arrives populated - or as a bare id if the customer was
// deleted/unreadable). See apps/api/src/collections/PromoCodes.ts.
export interface PromoCode {
  id: number;
  code: string;
  label?: string | null;
  kind: 'percentage' | 'flat';
  value: number;
  minSpend?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  maxUses?: number | null;
  usesCount?: number | null;
  active?: boolean | null;
  referrerCustomer?: { id: number; name: string } | number | null;
  referrerRewardPoints?: number | null;
}

export interface CustomerOption {
  id: number;
  name: string;
  phone?: string | null;
}

export type PromoStatus = 'Active' | 'Inactive' | 'Expired' | 'Scheduled' | 'Used up';

export function formatKES(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE')}`;
}

export function describeDiscount(promo: Pick<PromoCode, 'kind' | 'value'>): string {
  return promo.kind === 'percentage' ? `${promo.value}% off` : `${formatKES(promo.value)} off`;
}

// Same order of checks as evaluatePromo() in business-logic/promo.ts, so
// the badge tells the owner the same thing a cashier would hear at the till.
export function promoStatus(promo: PromoCode, now: Date = new Date()): PromoStatus {
  if (promo.active === false) return 'Inactive';
  if (promo.startsAt && now < new Date(promo.startsAt)) return 'Scheduled';
  if (promo.endsAt && now > new Date(promo.endsAt)) return 'Expired';
  if (promo.maxUses != null && promo.maxUses > 0 && (promo.usesCount ?? 0) >= promo.maxUses) return 'Used up';
  return 'Active';
}

export function describeConditions(promo: PromoCode): string[] {
  const parts: string[] = [];
  if (promo.minSpend && promo.minSpend > 0) parts.push(`Min. spend ${formatKES(promo.minSpend)}`);
  if (promo.startsAt && promo.endsAt) parts.push(`${formatDate(promo.startsAt)} – ${formatDate(promo.endsAt)}`);
  else if (promo.startsAt) parts.push(`From ${formatDate(promo.startsAt)}`);
  else if (promo.endsAt) parts.push(`Until ${formatDate(promo.endsAt)}`);
  return parts;
}

export function referrerName(promo: PromoCode): string | null {
  const ref = promo.referrerCustomer;
  if (ref && typeof ref === 'object') return ref.name;
  return null;
}

export function referrerId(promo: PromoCode): number | null {
  const ref = promo.referrerCustomer;
  if (ref == null) return null;
  return typeof ref === 'object' ? ref.id : ref;
}

export function shareText(promo: PromoCode, shopName: string | null): string {
  const where = shopName ? ` at ${shopName}` : '';
  let text = `Use code ${promo.code} for ${describeDiscount(promo)}${where}! 🛍️`;
  if (promo.minSpend && promo.minSpend > 0) text += ` Min. spend ${formatKES(promo.minSpend)}.`;
  if (promo.endsAt) text += ` Valid until ${formatDate(promo.endsAt)}.`;
  return text;
}
