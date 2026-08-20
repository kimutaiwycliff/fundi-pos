import { describe, expect, it } from 'vitest';
import { applyRestock, applyConsumption, costOfGoodsSold, type CostBasis } from './costing.js';

describe('weighted-average costing', () => {
  it('blends a restock into the running average cost', () => {
    const basis: CostBasis = { quantityOnHand: 10, averageCost: 100 };
    // 10 @ 100 (existing) + 10 @ 120 (incoming) => 20 @ 110
    const next = applyRestock(basis, 10, 120);
    expect(next.quantityOnHand).toBe(20);
    expect(next.averageCost).toBe(110);
  });

  it('leaves average cost unchanged on consumption, only reduces quantity', () => {
    const basis: CostBasis = { quantityOnHand: 20, averageCost: 110 };
    const next = applyConsumption(basis, 5);
    expect(next.quantityOnHand).toBe(15);
    expect(next.averageCost).toBe(110);
  });

  it('computes COGS at the current weighted-average cost', () => {
    const basis: CostBasis = { quantityOnHand: 15, averageCost: 110 };
    expect(costOfGoodsSold(basis, 3)).toBe(330);
  });

  it('rejects a non-positive restock quantity', () => {
    expect(() => applyRestock({ quantityOnHand: 0, averageCost: 0 }, 0, 10)).toThrow();
  });
});
