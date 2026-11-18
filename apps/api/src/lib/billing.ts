// The one place that decides whether a tenant's people may sign in or keep
// a till session alive, so every enforcement point (Users.ts beforeLogin,
// pin-login, till-refresh) stays consistent. The rule itself lives in
// @hardware-pos/business-logic's tenantAccess() so the web dashboard gate
// applies exactly the same one:
//   - suspended / deleted / canceled: blocked
//   - trial ended or paid period lapsed: blocked once ACCESS_GRACE_DAYS pass
//
// Blocking new sessions/token refreshes rather than touching every
// collection's access control: no login, and an open till is signed out on
// its next session refresh (apps/desktop + apps/mobile react to
// ACCESS_REVOKED_CODE below).
import { ACCESS_BLOCK_MESSAGES, tenantAccess, type AccessBlockReason } from '@hardware-pos/business-logic';

export type BillingStatus = 'active' | 'trialing' | 'past_due' | 'canceled';
export type TenantStatus = 'active' | 'suspended' | 'deleted';

// Returned as `code` on a 403 from till-refresh so tills can tell "you've
// been locked out, sign out now" apart from a transient failure.
export const ACCESS_REVOKED_CODE = 'access_revoked';

export interface TenantAccessCheckResult {
  allowed: boolean;
  reason?: AccessBlockReason;
  message?: string;
}

export function checkTenantAccess(tenant: {
  status?: string | null;
  billingStatus?: string | null;
  subscriptionTier?: string | null;
  paidUntil?: string | null;
  trialEndsAt?: string | null;
  createdAt?: string | null;
}): TenantAccessCheckResult {
  const access = tenantAccess(tenant);
  if (access.allowed || !access.reason) return { allowed: true };
  return { allowed: false, reason: access.reason, message: ACCESS_BLOCK_MESSAGES[access.reason] };
}
