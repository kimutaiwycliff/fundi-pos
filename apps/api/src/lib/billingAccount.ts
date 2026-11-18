import type { Payload } from 'payload';
import type { User } from '../payload-types.ts';
import { headers as nextHeaders } from 'next/headers';
import { isTenantUser, toID } from './relations.ts';

// Who may see and act on their shop's Fundi subscription: owners and
// managers. Deliberately NOT gated on tenantAccess() - a shop that's been
// locked out for non-payment must still be able to say "I've paid" with
// the session it already has (login itself is what's blocked).
export type BillingUserResult = { error: Response } | { user: User & { collection: 'users' }; tenantId: number };

export async function billingUser(payload: Payload): Promise<BillingUserResult> {
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (user.role !== 'owner' && user.role !== 'manager') {
    return { error: Response.json({ error: 'Only the owner or a manager can manage billing.' }, { status: 403 }) }
  }
  if (user.status === 'banned') return { error: Response.json({ error: 'This account has been disabled.' }, { status: 403 }) }
  return { user, tenantId: Number(toID(user.tenant)) }
}
