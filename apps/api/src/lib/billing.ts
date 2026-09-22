// billingStatus was previously just a label a platform admin could set via
// /admin with zero actual effect - nothing ever read it. This is the one
// place that decides what each status actually does, so every enforcement
// point (login, PIN login, till-session refresh) stays consistent.
//
// Deliberately soft on 'past_due' (a real subscription grace period, not an
// instant lockout) and hard on 'canceled' - blocking new sessions/token
// refreshes rather than touching every collection's access control, which
// would be far more invasive for the same practical effect: no login, and
// an already-open till session stops renewing once its current token
// expires (see tillAuth.ts's TILL_TOKEN_TTL_SECONDS).
//
// tenant.status (platform-admin-controlled suspend/soft-delete, distinct
// from the tenant's own billingStatus) is checked first and takes priority -
// a suspended/deleted tenant is locked out regardless of billing state, and
// gets its own distinct message rather than being folded into the billing
// one, since the two mean genuinely different things to whoever reads it.
export type BillingStatus = 'active' | 'trialing' | 'past_due' | 'canceled';
export type TenantStatus = 'active' | 'suspended' | 'deleted';

export interface TenantAccessCheckResult {
  allowed: boolean;
  message?: string;
}

export function checkTenantAccess(tenant: { status: string; billingStatus: string }): TenantAccessCheckResult {
  if (tenant.status === 'suspended') {
    return { allowed: false, message: 'This account has been suspended. Contact your platform administrator.' };
  }
  if (tenant.status === 'deleted') {
    return { allowed: false, message: 'This account no longer exists.' };
  }
  if (tenant.billingStatus === 'canceled') {
    return {
      allowed: false,
      message: 'This account\'s subscription has been canceled. Contact your platform administrator to reactivate it.',
    };
  }
  return { allowed: true };
}
