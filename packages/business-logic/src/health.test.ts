import { describe, expect, it } from 'vitest';
import { computeHealth, setupStage } from './health.ts';

const now = new Date('2026-11-17T09:00:00Z');
const ago = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
const base = {
  now,
  createdAt: ago(60),
  lastActiveAt: ago(1),
  firstSaleAt: ago(50),
  revenue30: 100_000,
  revenuePrev30: 100_000,
  activeStaff30: 2,
  staffCount: 2,
  state: 'paid' as const,
};

describe('computeHealth', () => {
  it('grades by days since last activity', () => {
    expect(computeHealth(base).level).toBe('healthy');
    expect(computeHealth({ ...base, lastActiveAt: ago(5) }).level).toBe('slipping');
    expect(computeHealth({ ...base, lastActiveAt: ago(10) }).level).toBe('at_risk');
    expect(computeHealth({ ...base, lastActiveAt: ago(20) }).level).toBe('inactive');
    expect(computeHealth({ ...base, lastActiveAt: null }).level).toBe('inactive');
  });

  it('separates new sign-ups from shops that never started', () => {
    expect(computeHealth({ ...base, createdAt: ago(3), firstSaleAt: null }).level).toBe('new');
    expect(computeHealth({ ...base, createdAt: ago(10), firstSaleAt: null }).level).toBe('never_started');
  });

  it('flags a halving of sales as slipping, with reasons', () => {
    const h = computeHealth({ ...base, revenue30: 40_000, activeStaff30: 1, staffCount: 3, state: 'overdue' });
    expect(h.level).toBe('slipping');
    expect(h.reasons).toEqual([
      'No activity in 1 day',
      'Sales down 60% vs the previous 30 days',
      '1 of 3 staff active this month',
      'Subscription payment overdue',
    ]);
  });

  it('mentions a trial about to end', () => {
    expect(computeHealth({ ...base, state: 'trial_ending', daysLeft: 2 }).reasons).toContain('Trial ends in 2 days');
  });
});

describe('setupStage', () => {
  it('reports the first missing step', () => {
    expect(setupStage({ products: 0, pricedProducts: 0, stockedProducts: 0, firstSaleAt: null })).toBe('no_products');
    expect(setupStage({ products: 5, pricedProducts: 0, stockedProducts: 0, firstSaleAt: null })).toBe('no_prices');
    expect(setupStage({ products: 5, pricedProducts: 5, stockedProducts: 0, firstSaleAt: null })).toBe('no_stock');
    expect(setupStage({ products: 5, pricedProducts: 5, stockedProducts: 5, firstSaleAt: null })).toBe('no_sale');
    expect(setupStage({ products: 0, pricedProducts: 0, stockedProducts: 0, firstSaleAt: ago(1) })).toBe('selling');
  });
});
