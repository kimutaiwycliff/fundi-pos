import { describe, expect, it } from 'vitest';
import { computeLine, computeOrderTotals, type LineInput } from './pricing.ts';

describe('computeLine', () => {
  it('applies discount then extracts tax-inclusive VAT', () => {
    // 2 units @ 58 = 116 gross, 10 flat discount => 106 gross, 16% VAT inclusive
    const line: LineInput = { quantity: 2, unitPrice: 58, discount: 10, taxRate: 0.16 };
    const result = computeLine(line);
    expect(result.subtotal).toBe(116);
    expect(result.discountedSubtotal).toBe(106);
    expect(result.appliedDiscount).toBe(10);
    expect(result.total).toBe(106);
    expect(result.netAmount + result.taxAmount).toBe(106);
  });
});

describe('computeOrderTotals', () => {
  it('sums discount/tax/total across multiple lines identically for desktop and web', () => {
    const lines: LineInput[] = [
      { quantity: 2, unitPrice: 58, discount: 10, taxRate: 0.16 },
      { quantity: 1, unitPrice: 232, discount: 0, taxRate: 0.16 },
    ];
    const totals = computeOrderTotals(lines);
    expect(totals.discountTotal).toBe(10);
    expect(totals.total).toBe(338); // 106 + 232
    expect(totals.taxTotal).toBeCloseTo(46.62, 2);
  });

  it('never applies more discount than a line subtotal, even if requested', () => {
    const lines: LineInput[] = [{ quantity: 1, unitPrice: 20, discount: 100, taxRate: 0 }];
    const totals = computeOrderTotals(lines);
    expect(totals.discountTotal).toBe(20);
    expect(totals.total).toBe(0);
  });
});
