import type { MetadataRoute } from 'next';
import { payloadPublicFetch } from '@/lib/payload-public-client';
import type { BlogPost } from '@/lib/blog-types';
import { SITE_URL } from '@/lib/site-url';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  // Live online shops (Sell Online add-on, shop open, "show on Google" on) -
  // the API only lists those, so a shop without the add-on never appears.
  // Best-effort, same as posts below.
  let shopRoutes: MetadataRoute.Sitemap = [];
  try {
    const { shops } = await payloadPublicFetch<{
      shops: Array<{ slug: string; updatedAt: string | null; products: Array<{ id: number; updatedAt: string | null }> }>;
    }>('/api/storefront', 600);
    shopRoutes = shops.flatMap((shop) => [
      {
        url: `${SITE_URL}/shop/${shop.slug}`,
        lastModified: shop.updatedAt ? new Date(shop.updatedAt) : new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.8,
      },
      ...shop.products.map((product) => ({
        url: `${SITE_URL}/shop/${shop.slug}/p/${product.id}`,
        lastModified: product.updatedAt ? new Date(product.updatedAt) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      })),
    ]);
  } catch {
    shopRoutes = [];
  }

  // Best-effort: if the API is briefly unreachable at build time, ship the
  // sitemap with just the static routes rather than failing the whole build.
  try {
    const { docs: posts } = await payloadPublicFetch<{ docs: BlogPost[] }>(
      '/api/posts?where[status][equals]=published&limit=200&depth=0',
    );
    const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: post.publishedAt ? new Date(post.publishedAt) : new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
    return [...staticRoutes, ...postRoutes, ...shopRoutes];
  } catch {
    return [...staticRoutes, ...shopRoutes];
  }
}
