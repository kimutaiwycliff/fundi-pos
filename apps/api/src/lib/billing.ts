// billingStatus was previously just a label a platform admin could set via
// /admin with zero actual effect - nothing ever read it. This is the one
// place that decides what each status actually does, so every enforcement
// point (login, PIN login, PowerSync token issuance) stays consistent.
//
// Deliberately soft on 'past_due' (a real subscription grace period, not an
// instant lockout) and hard on 'canceled' - blocking new sessions/tokens
// rather than touching every collection's access control, which would be
// far more invasive for the same practical effect: no login, no fresh
// PowerSync token, and the till stops syncing once its current token
// expires (see powersyncAuth.ts's 1-hour TTL) even if it was already open.
export type BillingStatus = 'active' | 'trialing' | 'past_due' | 'canceled';

export interface BillingCheckResult {
  allowed: boolean;
  status: BillingStatus;
  message?: string;
}

export function checkBillingStatus(billingStatus: string): BillingCheckResult {
  if (billingStatus === 'canceled') {
    return {
      allowed: false,
      status: billingStatus,
      message: 'This account\'s subscription has been canceled. Contact your platform administrator to reactivate it.',
    };
  }
  return { allowed: true, status: billingStatus as BillingStatus };
}
