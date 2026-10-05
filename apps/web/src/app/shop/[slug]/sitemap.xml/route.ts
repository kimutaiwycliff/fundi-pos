import { getStorefront, productUrl, shopUrl } from '@/components/storefront/storefront-data';

// Per-shop sitemap: /shop/<slug>/sitemap.xml. It lives inside the shop's
// own path on purpose - a Google Search Console URL-prefix property for
// /shop/<slug>/ can only accept sitemaps under that same prefix, so this is
// the URL an owner submits (Settings -> Online shop -> Search engines).
export const dynamic = 'force-dynamic';

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function urlEntry(loc: string, lastmod: string | null | undefined, priority: string): string {
  const mod = lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : '';
  return `<url><loc>${escapeXml(loc)}</loc>${mod}<priority>${priority}</priority></url>`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getStorefront(slug);
  // Unknown shop, add-on off, paused, or "hide from Google": no sitemap.
  if (!data || !data.available || data.shop.seo?.indexable === false) {
    return new Response('Not found', { status: 404 });
  }

  const entries = [
    urlEntry(shopUrl(data.shop.slug), data.shop.updatedAt, '1.0'),
    ...data.products.map((product) => urlEntry(productUrl(data.shop.slug, product.id), product.updatedAt, '0.8')),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
}
