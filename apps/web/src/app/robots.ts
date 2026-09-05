import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/platform'],
    },
    sitemap: 'https://app.fundipos.co.ke/sitemap.xml',
  };
}
