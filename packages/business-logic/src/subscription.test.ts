import { describe, expect, it } from 'vitest';
import { addMonths, cyclePrice, monthlyValue, needsAttention, nextBillingPeriod, subscriptionState, tenantAccess } from './subscription.ts';

const now = new Date('2026-10-05T09:00:00Z');

describe('subscriptionState', () => {
  it('reports paid / due soon / overdue / never paid from paidUntil', () => {
    const base = { status: 'active', subscriptionTier: 'starter', billingStatus: 'active' };
    expect(subscriptionState({ ...base, paidUntil: '2026-11-05T00:00:00Z' }, now)).toBe('paid');
    expect(subscriptionState({ ...base, paidUntil: '2026-10-09T00:00:00Z' }, now)).toBe('due_soon');
    expect(subscriptionState({ ...base, paidUntil: '2026-10-01T00:00:00Z' }, now)).toBe('overdue');
    expect(subscriptionState({ ...base, paidUntil: null }, now)).toBe('never_paid');
  });

  it('tracks trials from trialEndsAt, or 14 days after signup when unset', () => {
    const trial = { status: 'active', subscriptionTier: 'trial', billingStatus: 'trialing' };
    expect(subscriptionState({ ...trial, trialEndsAt: '2026-10-15T00:00:00Z' }, now)).toBe('trial');
    expect(subscriptionState({ ...trial, trialEndsAt: '2026-10-07T00:00:00Z' }, now)).toBe('trial_ending');
    expect(subscriptionState({ ...trial, trialEndsAt: '2026-10-01T00:00:00Z' }, now)).toBe('trial_expired');
    expect(subscriptionState({ ...trial, createdAt: '2026-09-01T00:00:00Z' }, now)).toBe('trial_expired');
    // Paid ahead during a trial counts as paid.
    expect(subscriptionState({ ...trial, paidUntil: '2026-12-01T00:00:00Z' }, now)).toBe('paid');
  });

  it('lets account locks and cancellation win', () => {
    expect(subscriptionState({ status: 'suspended', billingStatus: 'active', paidUntil: '2027-01-01' }, now)).toBe('suspended');
    expect(subscriptionState({ status: 'active', billingStatus: 'canceled', paidUntil: '2027-01-01' }, now)).toBe('canceled');
  });

  it('flags the states that need follow-up', () => {
    expect(needsAttention('overdue')).toBe(true);
    expect(needsAttention('trial_ending')).toBe(true);
    expect(needsAttention('paid')).toBe(false);
    expect(needsAttention('canceled')).toBe(false);
  });
});

describe('pricing + periods', () => {
  it('uses the negotiated price, else the list price per cycle', () => {
    expect(cyclePrice(1500, 'monthly', 'starter')).toBe(1500);
    expect(cyclePrice(null, 'quarterly', 'starter')).toBe(3000);
    expect(monthlyValue(null, 'annual', 'growth')).toBe(2800);
    expect(monthlyValue(30000, 'annual', 'growth')).toBe(2500);
    expect(monthlyValue(null, 'monthly', 'enterprise')).toBe(0);
  });

  it('adds calendar months, clamping to month end', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addMonths(new Date('2026-10-05T00:00:00Z'), 12).toISOString().slice(0, 10)).toBe('2027-10-05');
  });

  it('continues from a future paid-until date so paying early loses nothing', () => {
    const early = nextBillingPeriod('2026-10-20T00:00:00Z', 'monthly', now);
    expect(early.start.toISOString().slice(0, 10)).toBe('2026-10-20');
    expect(early.end.toISOString().slice(0, 10)).toBe('2026-11-20');
    const lapsed = nextBillingPeriod('2026-09-01T00:00:00Z', 'quarterly', now);
    expect(lapsed.start.toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(lapsed.end.toISOString().slice(0, 10)).toBe('2027-01-05');
  });
});

describe('tenantAccess', () => {
  const trial = { status: 'active', subscriptionTier: 'trial', billingStatus: 'trialing' };
  const paid = { status: 'active', subscriptionTier: 'starter', billingStatus: 'active' };

  it('allows an active trial and warns with the lock date', () => {
    const a = tenantAccess({ ...trial, trialEndsAt: '2026-10-07T00:00:00Z' }, now);
    expect(a.allowed).toBe(true);
    expect(a.lockAt?.toISOString()).toBe('2026-10-10T00:00:00.000Z');
  });

  it('keeps an expired trial open through the grace period, then blocks', () => {
    expect(tenantAccess({ ...trial, trialEndsAt: '2026-10-03T00:00:00Z' }, now).allowed).toBe(true);
    const blocked = tenantAccess({ ...trial, trialEndsAt: '2026-10-01T00:00:00Z' }, now);
    expect(blocked).toMatchObject({ allowed: false, reason: 'trial_ended' });
  });

  it('blocks an unpaid period after the grace period', () => {
    expect(tenantAccess({ ...paid, paidUntil: '2026-10-03T00:00:00Z' }, now).allowed).toBe(true);
    expect(tenantAccess({ ...paid, paidUntil: '2026-10-01T00:00:00Z' }, now)).toMatchObject({ allowed: false, reason: 'payment_overdue' });
    expect(tenantAccess({ ...paid, paidUntil: '2026-12-01T00:00:00Z' }, now)).toMatchObject({ allowed: true, lockAt: null });
  });

  it('holds a trial tenant to the later of trial end and paid-until', () => {
    const a = tenantAccess({ ...trial, trialEndsAt: '2026-09-01T00:00:00Z', paidUntil: '2026-10-04T00:00:00Z' }, now);
    expect(a.allowed).toBe(true);
  });

  it('never blocks a paid tier with no payment date to count from', () => {
    expect(tenantAccess({ ...paid, paidUntil: null }, now)).toMatchObject({ allowed: true, state: 'never_paid' });
  });

  it('blocks suspended, deleted and canceled tenants regardless of dates', () => {
    expect(tenantAccess({ ...paid, status: 'suspended', paidUntil: '2027-01-01' }, now).reason).toBe('suspended');
    expect(tenantAccess({ ...paid, status: 'deleted' }, now).reason).toBe('deleted');
    expect(tenantAccess({ ...paid, billingStatus: 'canceled', paidUntil: '2027-01-01' }, now).reason).toBe('canceled');
  });
});
