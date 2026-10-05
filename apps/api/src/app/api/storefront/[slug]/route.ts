import config from '@payload-config';
import { getPayload } from 'payload';
import { sql } from 'drizzle-orm';
import { hasAddon, normalizeShopSlug } from '@hardware-pos/business-logic';

// PUBLIC, unauthenticated - the Sell Online add-on's storefront feed, read
// by apps/web's /shop/[slug] pages. Every field returned is whitelisted
// below on purpose: never cost price, never exact stock counts, never
// anything about staff/customers/orders. Only products the owner ticked
// "Show in online shop" (Products.showOnline) appear.
//
// Add-on off => 404, exactly as if the shop never existed (a tenant without
// Sell Online must not be able to tell the feature is there). Add-on on but
// the owner paused the shop => 200 available:false + name/WhatsApp, so links
// already shared on social media land on a polite "short break" page.

type Availability = 'in_stock' | 'low' | 'sold_out';
const LOW_STOCK_THRESHOLD = 3;

function availabilityFor(quantity: number): Availability {
  if (quantity <= 0) return 'sold_out';
  if (quantity <= LOW_STOCK_THRESHOLD) return 'low';
  return 'in_stock';
}

function mediaUrl(media: unknown): string | null {
  if (media && typeof media === 'object' && 'url' in media) {
    const url = (media as { url?: string | null }).url;
    return url || null;
  }
  return null;
}

interface BalanceRow extends Record<string, unknown> {
  product_id: number;
  variant: string | null;
  quantity: number;
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = normalizeShopSlug(rawSlug);
  if (!slug) return Response.json({ error: 'not_found' }, { status: 404 });

  const payload = await getPayload({ config });
  const tenants = await payload.find({
    collection: 'tenants',
    where: { shopSlug: { equals: slug } },
    limit: 1,
    depth: 1, // populates seoImage for its URL
    overrideAccess: true,
  });
  const tenant = tenants.docs[0];
  if (!tenant || tenant.status !== 'active' || !hasAddon(tenant, 'sell_online')) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const shop = {
    name: tenant.name as string,
    slug,
    tagline: (tenant.storefrontTagline as string | null) ?? null,
    whatsappNumber: (tenant.whatsappNumber as string | null) ?? null,
    socialHandles: (tenant.socialHandles as string | null) ?? null,
    updatedAt: (tenant.updatedAt as string | null) ?? null,
    seo: {
      title: (tenant.seoTitle as string | null) ?? null,
      description: (tenant.seoDescription as string | null) ?? null,
      image: mediaUrl(tenant.seoImage),
      city: (tenant.storefrontCity as string | null) ?? null,
      // Unset on tenants from before this field existed - treat as allowed.
      indexable: tenant.storefrontIndexable !== false,
      googleSiteVerification: (tenant.googleSiteVerification as string | null) ?? null,
    },
  };
  const delivery = {
    zones: ((tenant.deliveryZones ?? []) as Array<{ name: string; fee: number; eta?: string | null }>).map((z) => ({
      name: z.name,
      fee: Number(z.fee ?? 0),
      eta: z.eta ?? null,
    })),
    freeThreshold: tenant.freeDeliveryThreshold ? Number(tenant.freeDeliveryThreshold) : null,
    payOnDelivery: tenant.payOnDelivery === true,
    sameDayCutoff: (tenant.sameDayCutoff as string | null) ?? null,
    sameDayArea: (tenant.sameDayArea as string | null) ?? null,
  };
  Object.assign(shop, { delivery });
  const cacheHeaders = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };

  if (!tenant.storefrontEnabled) {
    return Response.json({ available: false, shop, products: [] }, { headers: cacheHeaders });
  }

  const tenantId = Number(tenant.id);
  const [products, balances] = await Promise.all([
    payload.find({
      collection: 'products',
      where: { tenant: { equals: tenantId }, isActive: { equals: true }, showOnline: { equals: true } },
      pagination: false,
      depth: 1,
      sort: 'name',
      overrideAccess: true,
    }),
    payload.db.drizzle.execute<BalanceRow>(sql`
      SELECT product_id, variant, SUM(quantity_delta)::float8 AS quantity
      FROM stock_movements
      WHERE tenant_id = ${tenantId}
      GROUP BY product_id, variant
    `),
  ]);

  const stockByKey = new Map<string, number>();
  const stockByProduct = new Map<number, number>();
  for (const row of balances.rows) {
    stockByKey.set(`${row.product_id}::${row.variant ?? ''}`, row.quantity);
    stockByProduct.set(row.product_id, (stockByProduct.get(row.product_id) ?? 0) + row.quantity);
  }

  const items = products.docs.map((product) => {
    const id = Number(product.id);
    const variants = ((product.variants ?? []) as Array<{ id?: string; label: string; sellPrice?: number | null; image?: unknown }>).map(
      (variant) => ({
        id: variant.id ?? '',
        label: variant.label,
        price: Number(variant.sellPrice ?? product.sellPrice ?? 0),
        image: mediaUrl(variant.image),
        availability: availabilityFor(stockByKey.get(`${id}::${variant.id ?? ''}`) ?? 0),
      }),
    );
    // Bundles have no stock of their own (it lives on their components) -
    // shown as available and confirmed over WhatsApp.
    const availability: Availability = product.isBundle
      ? 'in_stock'
      : variants.length > 0
        ? (variants.some((v) => v.availability === 'in_stock')
            ? 'in_stock'
            : variants.some((v) => v.availability === 'low')
              ? 'low'
              : 'sold_out')
        : availabilityFor(stockByProduct.get(id) ?? 0);
    return {
      id,
      name: product.name as string,
      category: (product.category as string | null) || 'Other',
      description: (product.onlineDescription as string | null) ?? null,
      seoTitle: (product.seoTitle as string | null) ?? null,
      seoDescription: (product.seoDescription as string | null) ?? null,
      updatedAt: (product.updatedAt as string | null) ?? null,
      price: Number(product.sellPrice ?? 0),
      image: mediaUrl(product.image),
      availability,
      variants,
    };
  });

  return Response.json({ available: true, shop, products: items }, { headers: cacheHeaders });
}
