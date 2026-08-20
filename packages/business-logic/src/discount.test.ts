import { describe, expect, it } from 'vitest';
import { applyLineDiscount, resolvePromoDiscount } from './discount.ts';

describe('applyLineDiscount', () => {
  it('subtracts a flat discount from the line subtotal', () => {
    expect(applyLineDiscount(500, 50)).toBe(450);
  });

  it('clamps to zero rather than going negative', () => {
    expect(applyLineDiscount(30, 100)).toBe(0);
  });

  it('rejects a negative discount', () => {
    expect(() => applyLineDiscount(100, -10)).toThrow();
  });
});

describe('resolvePromoDiscount', () => {
  it('caps a flat promo at the line subtotal', () => {
    expect(resolvePromoDiscount(40, { code: 'X', kind: 'flat', value: 100 })).toBe(40);
  });

  it('computes a percentage promo', () => {
    expect(resolvePromoDiscount(200, { code: 'Y', kind: 'percentage', value: 0.1 })).toBe(20);
  });

  it('rejects an out-of-range percentage', () => {
    expect(() =>
      resolvePromoDiscount(200, { code: 'Z', kind: 'percentage', value: 1.5 }),
    ).toThrow();
  });
});
