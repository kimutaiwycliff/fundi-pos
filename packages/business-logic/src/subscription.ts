// Platform billing (the SaaS operator's view of each tenant's subscription).
// Shared by the API's platform stats endpoint and the /platform UI so "who
// is overdue?" has exactly one answer.

export const BILLING_CYCLES = ['monthly', 'quarterly', 'annual'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const CYCLE_MONTHS: Record<BillingCycle, number> = { monthly: 1, quarterly: 3, annual: 12 };

// Published list prices (KES / month) - the default when a tenant has no
// negotiated planPrice of its own. Enterprise is always custom.
export const TIER_LIST_PRICE: Record<string, number> = { trial: 0, starter: 1000, growth: 2800, enterprise: 0 };

export const TRIAL_DAYS = 14;
const DUE_SOON_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

export type SubscriptionState =
  | 'trial'
  | 'trial_ending'
  | 'trial_expired'
  | 'paid'
  | 'due_soon'
  | 'overdue'
  | 'never_paid'
  | 'canceled'
  | 'suspended';

export const SUBSCRIPTION_STATE_LABELS: Record<SubscriptionState, string> = {
  trial: 'In trial',
  trial_ending: 'Trial ending',
  trial_expired: 'Trial expired',
  paid: 'Paid',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  never_paid: 'Not yet paid',
  canceled: 'Canceled',
  suspended: 'Suspended',
};

export interface SubscriptionInput {
  status?: string | null; // tenant status: active | suspended | deleted
  subscriptionTier?: string | null;
  billingStatus?: string | null;
  paidUntil?: string | null;
  trialEndsAt?: string | null;
  createdAt?: string | null;
}

export function daysUntil(date: string | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - now.getTime()) / DAY);
}

// The one place that turns a tenant's billing fields into "where do they
// stand". Order matters: an account-level lock wins over billing details.
export function subscriptionState(t: SubscriptionInput, now: Date = new Date()): SubscriptionState {
  if (t.status === 'suspended' || t.status === 'deleted') return 'suspended';
  if (t.billingStatus === 'canceled') return 'canceled';

  if (t.subscriptionTier === 'trial' || t.billingStatus === 'trialing') {
    const trialEnd =
      t.trialEndsAt ?? (t.createdAt ? new Date(new Date(t.createdAt).getTime() + TRIAL_DAYS * DAY).toISOString() : null);
    const left = daysUntil(trialEnd, now);
    // A trial tenant who has already paid ahead is simply paid.
    const paidLeft = daysUntil(t.paidUntil, now);
    if (paidLeft != null && paidLeft > 0) return paidLeft <= DUE_SOON_DAYS ? 'due_soon' : 'paid';
    if (left == null) return 'trial';
    if (left < 0) return 'trial_expired';
    return left <= 3 ? 'trial_ending' : 'trial';
  }

  const left = daysUntil(t.paidUntil, now);
  if (left == null) return 'never_paid';
  if (left < 0) return 'overdue';
  if (left <= DUE_SOON_DAYS) return 'due_soon';
  return 'paid';
}

// Needs a human: chase payment, convert a trial, or follow up.
export function needsAttention(state: SubscriptionState): boolean {
  return state === 'overdue' || state === 'trial_ending' || state === 'trial_expired' || state === 'due_soon' || state === 'never_paid';
}

// Default amount for one billing cycle: the negotiated price, else the list
// price for the tier times the cycle length.
export function cyclePrice(planPrice: number | null | undefined, cycle: string | null | undefined, tier?: string | null): number {
  if (planPrice && planPrice > 0) return planPrice;
  const months = CYCLE_MONTHS[(cycle as BillingCycle) ?? 'monthly'] ?? 1;
  return (TIER_LIST_PRICE[tier ?? ''] ?? 0) * months;
}

// Monthly recurring revenue contribution of one tenant.
export function monthlyValue(planPrice: number | null | undefined, cycle: string | null | undefined, tier?: string | null): number {
  const months = CYCLE_MONTHS[(cycle as BillingCycle) ?? 'monthly'] ?? 1;
  return Math.round((cyclePrice(planPrice, cycle, tier) / months) * 100) / 100;
}

// Adds whole calendar months (clamping to month end: Jan 31 + 1 month = Feb 28/29).
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

// The period a new payment covers by default: it continues from the
// current paid-until date if that's still in the future (paying early never
// loses days), otherwise starts today.
export function nextBillingPeriod(
  paidUntil: string | null | undefined,
  cycle: string | null | undefined,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const current = paidUntil ? new Date(paidUntil) : null;
  const start = current && current > now ? current : now;
  return { start, end: addMonths(start, CYCLE_MONTHS[(cycle as BillingCycle) ?? 'monthly'] ?? 1) };
}

// ---------------------------------------------------------------------------
// Automatic access enforcement.
//
// A lapsed trial or an unpaid period doesn't lock the shop out on the spot:
// they get ACCESS_GRACE_DAYS to pay, with a warning everywhere in the
// meantime. After that every login, PIN login and till-session refresh is
// refused, and an open dashboard redirects on its next page load.
// 'never_paid' (a paid tier with no payment ever recorded - typically a
// tenant the operator moved off trial by hand) is deliberately NOT blocked:
// there's no date it lapsed on, so there's nothing to count a grace from.
export const ACCESS_GRACE_DAYS = 3;

export type AccessBlockReason = 'suspended' | 'deleted' | 'canceled' | 'trial_ended' | 'payment_overdue';

export interface TenantAccess {
  allowed: boolean;
  reason?: AccessBlockReason;
  state: SubscriptionState;
  // When access stops (allowed) or stopped (blocked) - only for the two
  // date-driven lapses; null for everything else.
  lockAt: Date | null;
}

function trialEndDate(t: SubscriptionInput): Date | null {
  if (t.trialEndsAt) return new Date(t.trialEndsAt);
  if (t.createdAt) return new Date(new Date(t.createdAt).getTime() + TRIAL_DAYS * DAY);
  return null;
}

export function tenantAccess(t: SubscriptionInput, now: Date = new Date()): TenantAccess {
  const state = subscriptionState(t, now);
  if (t.status === 'suspended') return { allowed: false, reason: 'suspended', state, lockAt: null };
  if (t.status === 'deleted') return { allowed: false, reason: 'deleted', state, lockAt: null };
  if (state === 'canceled') return { allowed: false, reason: 'canceled', state, lockAt: null };

  let lapsedAt: Date | null = null;
  let reason: AccessBlockReason | undefined;
  if (state === 'trial' || state === 'trial_ending' || state === 'trial_expired') {
    // A trial tenant who once paid but let it run out is held to whichever
    // date is later - the trial end or the end of what they paid for.
    const trialEnd = trialEndDate(t);
    const paid = t.paidUntil ? new Date(t.paidUntil) : null;
    lapsedAt = trialEnd && paid ? (trialEnd > paid ? trialEnd : paid) : (trialEnd ?? paid);
    reason = 'trial_ended';
  } else if (state === 'due_soon' || state === 'overdue') {
    lapsedAt = t.paidUntil ? new Date(t.paidUntil) : null;
    reason = 'payment_overdue';
  }

  if (!lapsedAt) return { allowed: true, state, lockAt: null };
  const lockAt = new Date(lapsedAt.getTime() + ACCESS_GRACE_DAYS * DAY);
  if (now >= lockAt) return { allowed: false, reason, state, lockAt };
  return { allowed: true, state, lockAt };
}

export const ACCESS_BLOCK_MESSAGES: Record<AccessBlockReason, string> = {
  suspended: 'This account has been suspended. Contact Fundi POS support.',
  deleted: 'This account no longer exists.',
  canceled: "This account's subscription has been canceled. Contact Fundi POS support to reactivate it.",
  trial_ended: 'Your free trial has ended. Pay for your subscription to keep using Fundi POS.',
  payment_overdue: 'Your subscription payment is overdue. Pay to restore access to Fundi POS.',
};
