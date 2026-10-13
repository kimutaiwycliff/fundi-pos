// Public, canonical origin of the marketing site, blog and online shops -
// metadataBase, canonical/OG urls, sitemap and shared shop links all derive
// from it. The bare domain serves these pages; app. stays for login/dashboard.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://fundipos.co.ke').replace(/\/+$/, '');
