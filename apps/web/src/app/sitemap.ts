import type { MetadataRoute } from 'next';
import { payloadPublicFetch } from '@/lib/payload-public-client';
import type { BlogPost } from '@/lib/blog-types';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: 'https://app.fundipos.co.ke',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: 'https://app.fundipos.co.ke/blog',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: 'https://app.fundipos.co.ke/terms',
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: 'https://app.fundipos.co.ke/privacy',
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  // Best-effort: if the API is briefly unreachable at build time, ship the
  // sitemap with just the static routes rather than failing the whole build.
  try {
    const { docs: posts } = await payloadPublicFetch<{ docs: BlogPost[] }>(
      '/api/posts?where[status][equals]=published&limit=200&depth=0',
    );
    const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
      url: `https://app.fundipos.co.ke/blog/${post.slug}`,
      lastModified: post.publishedAt ? new Date(post.publishedAt) : new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
    return [...staticRoutes, ...postRoutes];
  } catch {
    return staticRoutes;
  }
}
