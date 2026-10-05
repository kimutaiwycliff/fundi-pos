import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  absoluteImage,
  categoryAnchor,
  getStorefront,
  shopRobots,
  shopSeoDescription,
  shopSeoTitle,
  groupByCategory,
  jsonLdString,
  productImage,
  productUrl,
  shopOrderLink,
  shopPath,
  shopUrl,
  type StorefrontShop,
} from '@/components/storefront/storefront-data';
import { ProductCard, ShopFooter, ShopShell, WhatsAppOrderButton } from '@/components/storefront/storefront-ui';

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

function ShopHeader({ shop, orderLink }: { shop: StorefrontShop; orderLink: string | null }) {
  return (
    <header className="border-b border-[#eadfd3] bg-[#fbf7f2]">
      <div className="mx-auto max-w-5xl px-4 pt-8 pb-6 text-center sm:pt-12">
        <p className="text-[11px] font-medium tracking-[0.25em] text-[#a07e5f] uppercase">Online shop</p>
        <h1 className="mt-2 font-serif text-3xl leading-tight font-semibold break-words text-stone-900 sm:text-4xl">
          {shop.name}
        </h1>
        {shop.tagline ? <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 sm:text-base">{shop.tagline}</p> : null}
        {shop.socialHandles ? (
          <p className="mx-auto mt-3 max-w-md text-xs break-words text-stone-500">Follow us: {shop.socialHandles}</p>
        ) : null}
        {orderLink ? (
          <div className="mt-5 hidden sm:block">
            <WhatsAppOrderButton href={orderLink} />
          </div>
        ) : null}
      </div>
    </header>
  );
}

function StickyOrderBar({ orderLink }: { orderLink: string | null }) {
  if (!orderLink) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eadfd3] bg-[#fbf7f2]/95 px-4 py-3 backdrop-blur sm:inset-x-auto sm:right-5 sm:bottom-5 sm:rounded-full sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      <WhatsAppOrderButton href={orderLink} size="lg" className="w-full shadow-lg sm:w-auto" />
    </div>
  );
}

function PausedShop({ shop }: { shop: StorefrontShop }) {
  const orderLink = shopOrderLink(shop);
  return (
    <ShopShell>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-[11px] font-medium tracking-[0.25em] text-[#a07e5f] uppercase">{shop.name}</p>
        <h1 className="mt-3 font-serif text-2xl font-semibold text-stone-900 sm:text-3xl">
          This shop is taking a short break
        </h1>
        <p className="mt-3 text-sm text-stone-600">
          {orderLink
            ? "Our online catalogue is resting for now, but we're still taking orders — WhatsApp us and we'll help you right away."
            : 'Our online catalogue is resting for now. Please check back soon.'}
        </p>
        {orderLink ? (
          <div className="mt-6">
            <WhatsAppOrderButton href={orderLink} label="WhatsApp us to order" size="lg" />
          </div>
        ) : null}
        {shop.socialHandles ? <p className="mt-6 text-xs break-words text-stone-500">Follow us: {shop.socialHandles}</p> : null}
      </main>
      <ShopFooter />
    </ShopShell>
  );
}

export default async function ShopPage({ params }: { params: Params }) {
  const { slug } = await params;
  const data = await getStorefront(slug);
  if (!data) notFound();

  const { shop } = data;
  if (!data.available) return <PausedShop shop={shop} />;

  const groups = groupByCategory(data.products);
  const orderLink = shopOrderLink(shop);

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
      <ShopHeader shop={shop} orderLink={orderLink} />

      {groups.length > 1 ? (
        <nav
          aria-label="Categories"
          className="sticky top-0 z-30 border-b border-[#eadfd3] bg-[#fbf7f2]/95 backdrop-blur"
        >
          <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {groups.map(({ category }) => (
              <a
                key={category}
                href={`#${categoryAnchor(category)}`}
                className="shrink-0 rounded-full border border-[#e2d3c3] bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-[#c9a988] hover:text-stone-900"
              >
                {category}
              </a>
            ))}
          </div>
        </nav>
      ) : null}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {groups.length === 0 ? (
          <div className="mx-auto max-w-sm py-16 text-center">
            <p className="font-serif text-xl text-stone-800">New pieces coming soon</p>
            <p className="mt-2 text-sm text-stone-600">
              {orderLink ? 'WhatsApp us to ask what is in store today.' : 'Please check back soon.'}
            </p>
          </div>
        ) : (
          groups.map(({ category, products }) => (
            <section key={category} id={categoryAnchor(category)} className="scroll-mt-16 pb-8">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 className="font-serif text-xl font-semibold text-stone-900">{category}</h2>
                <span className="text-xs text-stone-500">
                  {products.length} {products.length === 1 ? 'item' : 'items'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                {products.map((product) => (
                  <ProductCard key={product.id} shop={shop} product={product} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <ShopFooter />
      {/* Keeps the footer clear of the fixed mobile order bar. */}
      {orderLink ? <div aria-hidden className="h-20 sm:hidden" /> : null}
      <StickyOrderBar orderLink={orderLink} />
    </ShopShell>
  );
}
