import type { Payload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { isTenantUser, toID } from './relations.ts';

// Who may see and act on their shop's Fundi subscription: owners and
// managers. Deliberately NOT gated on tenantAccess() - a shop that's been
// locked out for non-payment must still be able to say "I've paid" with
// the session it already has (login itself is what's blocked).
export async function billingUser(payload: Payload) {
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  if (user.role !== 'owner' && user.role !== 'manager') {
    return { error: Response.json({ error: 'Only the owner or a manager can manage billing.' }, { status: 403 }) } as const;
  }
  if (user.status === 'banned') return { error: Response.json({ error: 'This account has been disabled.' }, { status: 403 }) } as const;
  return { user, tenantId: Number(toID(user.tenant)) } as const;
}
