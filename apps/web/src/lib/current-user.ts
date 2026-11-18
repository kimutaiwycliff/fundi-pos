import { redirect } from 'next/navigation';
import { payloadFetch, PayloadApiError } from './payload-client';

export type CurrentUser = {
  id: number;
  email: string;
  name: string | null;
  role: 'owner' | 'manager' | 'cashier';
  status: 'active' | 'banned';
  // `addons` (platform-admin-controlled, see Tenants.ts) gates the Sell
  // Online screens - checked with business-logic's hasAddon().
  tenant:
    | {
        id: number;
        name: string;
        status?: 'active' | 'suspended' | 'deleted';
        billingStatus: 'active' | 'trialing' | 'past_due' | 'canceled';
        // Read by the dashboard layout's access gate (business-logic's
        // tenantAccess) - lapsed trial/payment locks the dashboard.
        subscriptionTier?: string | null;
        paidUntil?: string | null;
        trialEndsAt?: string | null;
        createdAt?: string | null;
        addons?: string[] | null;
        storefrontListAll?: boolean | null;
      }
    | number;
  // Nullable for org-level users (owner/manager overseeing multiple stores) -
  // see Users.ts's `store` field. A cashier/store-level manager always has
  // one; the Sell page uses this to skip its store picker for them.
  store: { id: number; name: string } | number | null;
};

// Shared by the dashboard layout and any page that needs to branch on role
// (e.g. hiding cost/profit from non-owners) - one fetch shape, not
// duplicated per page. Redirects to /login on an expired/missing session,
// same as the layout always did.
export async function getCurrentUser(): Promise<CurrentUser> {
  try {
    const result = await payloadFetch<{ user: CurrentUser | null }>('/api/users/me');
    if (!result.user) redirect('/login');
    return result.user;
  } catch (err) {
    if (err instanceof PayloadApiError && err.status === 401) {
      redirect('/login');
    }
    throw err;
  }
}
