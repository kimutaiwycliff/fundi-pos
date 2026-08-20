import { roundCurrency } from './money.ts';

// Line-level discount is a flat monetary amount (matches OrderLineItem.discount
// in shared-types). Promo codes resolve to a flat amount or percentage-off
// before being applied here, so this stays a single simple primitive.
export function applyLineDiscount(lineSubtotal: number, discount: number): number {
  if (discount < 0) {
    throw new Error(`discount must be >= 0, got ${discount}`);
  }
  return roundCurrency(Math.max(0, lineSubtotal - discount));
}

export interface PromoCode {
  code: string;
  kind: 'flat' | 'percentage';
  value: number; // flat: currency amount; percentage: 0-1
}

export function resolvePromoDiscount(lineSubtotal: number, promo: PromoCode): number {
  if (promo.kind === 'flat') {
    return roundCurrency(Math.min(promo.value, lineSubtotal));
  }
  if (promo.value < 0 || promo.value > 1) {
    throw new Error(`percentage promo value must be within 0-1, got ${promo.value}`);
  }
  return roundCurrency(lineSubtotal * promo.value);
}
