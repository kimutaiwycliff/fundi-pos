import { describe, expect, it } from 'vitest';
import { computeTax } from './tax.js';

describe('computeTax', () => {
  it('extracts VAT from a tax-inclusive gross amount (KRA default: 16%)', () => {
    const result = computeTax(116, 0.16, 'inclusive');
    expect(result.grossAmount).toBe(116);
    expect(result.netAmount).toBe(100);
    expect(result.taxAmount).toBe(16);
  });

  it('adds VAT on top of a tax-exclusive net amount', () => {
    const result = computeTax(100, 0.16, 'exclusive');
    expect(result.netAmount).toBe(100);
    expect(result.taxAmount).toBe(16);
    expect(result.grossAmount).toBe(116);
  });

  it('handles zero tax rate', () => {
    const result = computeTax(50, 0, 'inclusive');
    expect(result.taxAmount).toBe(0);
    expect(result.netAmount).toBe(50);
  });

  it('rejects a negative tax rate', () => {
    expect(() => computeTax(100, -0.1)).toThrow();
  });
});
