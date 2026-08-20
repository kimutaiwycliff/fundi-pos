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
