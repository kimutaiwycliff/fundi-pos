import { roundCurrency } from './money.ts';
import { computeTax, type TaxMode } from './tax.ts';
import { applyLineDiscount } from './discount.ts';

export interface LineInput {
  quantity: number;
  unitPrice: number;
  discount: number; // flat amount applied once to the whole line, per shared-types OrderLineItem
  taxRate: number;
}

export interface LineResult {
  subtotal: number;
  discountedSubtotal: number;
  appliedDiscount: number;
  netAmount: number;
  taxAmount: number;
  total: number;
}

export function computeLine(line: LineInput, taxMode: TaxMode = 'inclusive'): LineResult {
  const subtotal = roundCurrency(line.quantity * line.unitPrice);
  const discountedSubtotal = applyLineDiscount(subtotal, line.discount);
  const appliedDiscount = roundCurrency(subtotal - discountedSubtotal);
  const { netAmount, taxAmount, grossAmount } = computeTax(
    discountedSubtotal,
    line.taxRate,
    taxMode,
  );
  return { subtotal, discountedSubtotal, appliedDiscount, netAmount, taxAmount, total: grossAmount };
}

export interface OrderTotals {
  discountTotal: number;
  taxTotal: number;
  total: number;
}

// Sums per-line results into the Order-level fields (taxTotal, discountTotal,
// total) that shared-types.Order and the desktop/web checkout UIs both need
// to agree on bit-for-bit.
export function computeOrderTotals(lines: LineInput[], taxMode: TaxMode = 'inclusive'): OrderTotals {
  let discountTotal = 0;
  let taxTotal = 0;
  let total = 0;

  for (const line of lines) {
    const result = computeLine(line, taxMode);
    discountTotal = roundCurrency(discountTotal + result.appliedDiscount);
    taxTotal = roundCurrency(taxTotal + result.taxAmount);
    total = roundCurrency(total + result.total);
  }

  return { discountTotal, taxTotal, total };
}

export interface OrderAdjustments {
  promoDiscount?: number;
  loyaltyDiscount?: number;
}

export interface CheckoutTotals extends OrderTotals {
  // Sum of the lines after their own per-line discounts, before any
  // order-level discount - what a promo's minSpend/percentage is measured
  // against.
  subtotal: number;
  lineDiscountTotal: number;
  promoDiscount: number;
  loyaltyDiscount: number;
}

// computeOrderTotals plus order-level discounts (a promo code, loyalty
// points). An order-level discount can't just be subtracted from the grand
// total - each line carries its own tax rate (some products are VAT-exempt),
// so the discount is spread across lines in proportion to their value and
// each line's tax is recomputed on what's left. With no adjustments this
// returns exactly what computeOrderTotals does, so existing orders total
// identically.
export function computeCheckoutTotals(
  lines: LineInput[],
  adjustments: OrderAdjustments = {},
  taxMode: TaxMode = 'inclusive',
): CheckoutTotals {
  const results = lines.map((line) => ({ line, result: computeLine(line, taxMode) }));
  const subtotal = roundCurrency(results.reduce((sum, r) => sum + r.result.discountedSubtotal, 0));
  const lineDiscountTotal = roundCurrency(results.reduce((sum, r) => sum + r.result.appliedDiscount, 0));

  const promoDiscount = roundCurrency(Math.max(0, Math.min(adjustments.promoDiscount ?? 0, subtotal)));
  const loyaltyDiscount = roundCurrency(Math.max(0, Math.min(adjustments.loyaltyDiscount ?? 0, subtotal - promoDiscount)));
  const orderDiscount = roundCurrency(promoDiscount + loyaltyDiscount);

  if (orderDiscount === 0) {
    const base = computeOrderTotals(lines, taxMode);
    return { ...base, subtotal, lineDiscountTotal, promoDiscount: 0, loyaltyDiscount: 0 };
  }

  // Proportional allocation; the last line with value absorbs the rounding
  // remainder so the allocated pieces always sum to exactly orderDiscount.
  const lastValuedIndex = results.reduce((last, r, i) => (r.result.discountedSubtotal > 0 ? i : last), -1);
  let allocated = 0;
  let taxTotal = 0;
  let total = 0;
  results.forEach(({ line, result }, i) => {
    let share = 0;
    if (result.discountedSubtotal > 0 && subtotal > 0) {
      share =
        i === lastValuedIndex
          ? roundCurrency(orderDiscount - allocated)
          : roundCurrency((orderDiscount * result.discountedSubtotal) / subtotal);
      share = Math.min(Math.max(0, share), result.discountedSubtotal);
      allocated = roundCurrency(allocated + share);
    }
    const { taxAmount, grossAmount } = computeTax(roundCurrency(result.discountedSubtotal - share), line.taxRate, taxMode);
    taxTotal = roundCurrency(taxTotal + taxAmount);
    total = roundCurrency(total + grossAmount);
  });

  return {
    subtotal,
    lineDiscountTotal,
    promoDiscount,
    loyaltyDiscount,
    discountTotal: roundCurrency(lineDiscountTotal + orderDiscount),
    taxTotal,
    total,
  };
}
