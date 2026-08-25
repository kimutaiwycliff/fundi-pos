import config from '@payload-config';
import { getPayload } from 'payload';

// Self-serve tenant onboarding - previously the only way to get a new
// tenant into the system was a human running seed.ts/the Local API by
// hand. Creates a Tenant (trial/trialing, same defaults as everywhere
// else a tenant is provisioned) and its first owner User, then logs that
// owner straight in - one form, no separate "check your email" step,
// since there's no email adapter configured to send one anyway (see
// payload.config.ts's own startup warning about this).
//
// Tenant creation then owner creation isn't wrapped in a single DB
// transaction - Payload's Local API doesn't expose an easy way to share
// one across two independent collection creates from a plain route
// handler. Instead: if the owner create fails (most likely a duplicate
// email, globally unique via Payload's own auth field), the just-created
// tenant is deleted as a compensating action, so a failed signup never
// leaves an orphan tenant with no owner behind.
export async function POST(request: Request) {
  const { businessName, email, password } = await request.json().catch(() => ({}));
  if (typeof businessName !== 'string' || !businessName.trim()) {
    return Response.json({ error: 'businessName is required' }, { status: 400 });
  }
  if (typeof email !== 'string' || !email.trim()) {
    return Response.json({ error: 'email is required' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return Response.json({ error: 'password must be at least 8 characters' }, { status: 400 });
  }

  const payload = await getPayload({ config });

  const tenant = await payload.create({
    collection: 'tenants',
    data: { name: businessName.trim(), subscriptionTier: 'trial', billingStatus: 'trialing' },
    overrideAccess: true,
  });

  let owner;
  try {
    owner = await payload.create({
      collection: 'users',
      data: { tenant: tenant.id, role: 'owner', status: 'active', email: email.trim(), password },
      overrideAccess: true,
    });
  } catch (err) {
    await payload.delete({ collection: 'tenants', id: tenant.id, overrideAccess: true }).catch(() => null);
    const message = err instanceof Error ? err.message : 'Could not create your account';
    return Response.json({ error: message.includes('email') ? 'That email is already in use' : message }, { status: 400 });
  }

  // The blessed way to mint a real session from credentials we already
  // hold server-side - unlike pin-login.ts, there's no need to hand-sign a
  // JWT here since Payload's own login() does exactly this correctly.
  const { token, user, exp } = await payload.login({
    collection: 'users',
    data: { email: owner.email, password },
  });

  return Response.json({ token, user, exp });
}
