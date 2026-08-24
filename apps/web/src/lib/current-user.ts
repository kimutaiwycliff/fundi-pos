import { redirect } from 'next/navigation';
import { payloadFetch, PayloadApiError } from './payload-client';

export type CurrentUser = {
  id: number;
  email: string;
  name: string | null;
  role: 'owner' | 'manager' | 'cashier';
  tenant: { id: number; name: string; billingStatus: 'active' | 'trialing' | 'past_due' | 'canceled' } | number;
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
