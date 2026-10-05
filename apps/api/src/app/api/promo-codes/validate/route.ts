import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { evaluatePromo, hasAddon, normalizePromoCode, type PromoRule } from '@hardware-pos/business-logic';
import { isTenantUser, toID } from '@/lib/relations';

// Checkout preview for a promo code typed at any till - "does BF2026 work
// on this basket, and how much does it take off?". Purely advisory: the
// real discount is recomputed by Orders.ts when the sale is created, with
// the exact same evaluatePromo(), so this can never be used to inflate one.
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!isTenantUser(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { code?: string; subtotal?: number } | null;
  const code = normalizePromoCode(body?.code);
  const subtotal = Number(body?.subtotal ?? 0);
  if (!code) return Response.json({ ok: false, reason: 'Enter a promo code.' });

  const tenantId = toID(user.tenant);
  const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, overrideAccess: true });
  if (!hasAddon(tenant, 'sell_online')) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const found = await payload.find({
    collection: 'promo-codes',
    where: { tenant: { equals: tenantId }, code: { equals: code } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const promo = found.docs[0];
  if (!promo) return Response.json({ ok: false, reason: `Promo code ${code} doesn't exist.` });

  const result = evaluatePromo(promo as unknown as PromoRule, Number.isFinite(subtotal) ? subtotal : 0);
  return Response.json({ ...result, code, label: promo.label ?? null });
}
