import config from '@payload-config';
import { getPayload } from 'payload';
import { hasAddon, isListedOnline } from '@hardware-pos/business-logic';

// PUBLIC sitemap index for the storefronts - every live shop (add-on on,
// owner opened it, "show on Google" left on) and its listed product ids
// with last-modified dates. Read by apps/web's sitemap.xml and each shop's
// own /shop/<slug>/sitemap.xml. Slugs, ids and dates only - nothing else.
export async function GET() {
  const payload = await getPayload({ config });
  const tenants = await payload.find({
    collection: 'tenants',
    where: {
      status: { equals: 'active' },
      storefrontEnabled: { equals: true },
      shopSlug: { exists: true },
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });

  const live = tenants.docs.filter((t) => t.shopSlug && hasAddon(t, 'sell_online') && t.storefrontIndexable !== false);
  const shops = await Promise.all(
    live.map(async (tenant) => {
      const products = await payload.find({
        collection: 'products',
        where: { tenant: { equals: tenant.id }, isActive: { equals: true } },
        pagination: false,
        depth: 0,
        select: { updatedAt: true, showOnline: true, hideOnline: true },
        overrideAccess: true,
      });
      return {
        slug: tenant.shopSlug as string,
        updatedAt: (tenant.updatedAt as string | null) ?? null,
        products: products.docs
          .filter((p) => isListedOnline(p, tenant.storefrontListAll === true))
          .map((p) => ({ id: Number(p.id), updatedAt: (p.updatedAt as string | null) ?? null })),
      };
    }),
  );

  return Response.json({ shops }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } });
}
