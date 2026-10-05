import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  absoluteImage,
  getStorefront,
  shopRobots,
  shopSeoDescription,
  shopSeoTitle,
  jsonLdString,
  productImage,
  productUrl,
  shopOrderLink,
  shopPath,
  shopUrl,
  type StorefrontShop,
} from '@/components/storefront/storefront-data';
import { OrderingSteps, ShopFooter, ShopShell, WhatsAppOrderButton } from '@/components/storefront/storefront-ui';
import { Catalog, DeliveryPromise, RecentlyViewed, ShopTopBar } from '@/components/storefront/shop-client';

// Same reasoning as blog/[slug]/page.tsx: the Payload API isn't reachable
// at image-build time, so render per request. payloadPublicFetch's
// `next: { revalidate: 60 }` still serves repeat hits from the Data Cache.
export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getStorefront(slug);
  if (!data) return {};

  const { shop } = data;
  // Owner's Settings -> Online shop -> Search engines values, with sensible
  // fallbacks (name + town + tagline) when they leave them blank.
  const title = shopSeoTitle(shop);
  const description = shopSeoDescription(shop);
  const shareImage =
    absoluteImage(shop.seo?.image) ?? (data.available ? data.products.map(productImage).find(Boolean) : undefined);
  const images = shareImage ? [shareImage] : undefined;
  // A paused shop is a placeholder - never let search engines list it.
  const robots = data.available ? shopRobots(shop) : { index: false, follow: false };

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: shopPath(shop.slug) },
    robots,
    // Lets the owner verify /shop/<slug>/ as a URL-prefix property in Google
    // Search Console (HTML-tag method) and submit its sitemap.
    verification: shop.seo?.googleSiteVerification ? { google: shop.seo.googleSiteVerification } : undefined,
    openGraph: { title, description, type: 'website', url: shopUrl(shop.slug), siteName: shop.name, images, locale: 'en_KE' },
    twitter: { card: images ? 'summary_large_image' : 'summary', title, description, images },
  };
}

function PausedShop({ shop }: { shop: StorefrontShop }) {
  const orderLink = shopOrderLink(shop);
  return (
    <ShopShell>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        <p className="max-w-full text-sm break-words text-(--sf-muted)">{shop.name}</p>
        <h1 className="mt-3 text-[clamp(1.75rem,8vw,1.875rem)] leading-tight font-light text-balance">This shop is taking a short break</h1>
        <p className="mt-3 text-[15px] text-(--sf-muted)">
          {orderLink
            ? "Our online catalogue is resting for now, but we're still taking orders. WhatsApp us and we'll help you right away."
            : 'Our online catalogue is resting for now. Please check back soon.'}
        </p>
        {orderLink ? (
          <div className="mt-7">
            <WhatsAppOrderButton href={orderLink} label="WhatsApp us to order" size="lg" />
          </div>
        ) : null}
      </main>
      <ShopFooter shopName={shop.name} socialHandles={shop.socialHandles} />
    </ShopShell>
  );
}

export default async function ShopPage({ params }: { params: Params }) {
  const { slug } = await params;
  const data = await getStorefront(slug);
  if (!data) notFound();

  const { shop } = data;
  if (!data.available) return <PausedShop shop={shop} />;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: shop.name,
    description: shopSeoDescription(shop),
    url: shopUrl(shop.slug),
    image: absoluteImage(shop.seo?.image) ?? undefined,
    telephone: shop.whatsappNumber ?? undefined,
    address: shop.seo?.city ? { '@type': 'PostalAddress', addressLocality: shop.seo.city, addressCountry: 'KE' } : undefined,
    areaServed: 'KE',
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: shop.name,
      itemListElement: data.products.map((product) => ({
        '@type': 'Offer',
        url: productUrl(shop.slug, product.id),
        price: product.price,
        priceCurrency: 'KES',
        itemOffered: { '@type': 'Product', name: product.name, image: productImage(product) ?? undefined },
      })),
    },
  };

  return (
    <ShopShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <ShopTopBar shop={shop} products={data.products} />

      {/* The one bold move: the shop's name, set large, light and open. */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-10 pb-8 sm:pt-16 md:pt-20 md:pb-12">
        <h1 className="text-[clamp(2.25rem,11vw,6.5rem)] leading-[0.95] font-light tracking-[0.04em] break-words hyphens-auto">{shop.name}</h1>
        <div className="mt-5 flex flex-col gap-1 text-[15px] text-(--sf-muted) sm:flex-row sm:items-baseline sm:gap-4">
          {shop.tagline ? <p className="text-(--sf-ink)">{shop.tagline}</p> : null}
          {shop.seo?.city ? <p>{shop.seo.city}</p> : null}
        </div>
        <DeliveryPromise shop={shop} className="mt-6" />
        <div className="mt-8 border-t border-(--sf-line) pt-5">
          <OrderingSteps />
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16">
        {data.products.length === 0 ? (
          <div className="mx-auto max-w-sm py-16 text-center">
            <p className="text-xl font-light">New pieces coming soon</p>
            <p className="mt-2 text-sm text-(--sf-muted)">
              {shopOrderLink(shop) ? 'WhatsApp us to ask what is in store today.' : 'Please check back soon.'}
            </p>
          </div>
        ) : (
          <Catalog shop={shop} products={data.products} />
        )}
        <RecentlyViewed shop={shop} products={data.products} />
      </main>

      <ShopFooter shopName={shop.name} socialHandles={shop.socialHandles} />
    </ShopShell>
  );
}
