import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  absoluteImage,
  clampText,
  shopRobots,
  formatKes,
  formatPriceSummary,
  getStorefront,
  jsonLdString,
  productImage,
  productOrderLink,
  productPath,
  productUrl,
  shopOrderLink,
  shopPath,
  type StorefrontProduct,
  type StorefrontResponse,
} from '@/components/storefront/storefront-data';
import {
  AvailabilityBadge,
  ImagePlaceholder,
  ShopFooter,
  ShopShell,
  WhatsAppOrderButton,
} from '@/components/storefront/storefront-ui';
import { cn } from '@/lib/utils';

// See shop/[slug]/page.tsx - request-time render, 60s fetch revalidation.
export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string; productId: string }>;

async function getProduct(
  slug: string,
  productId: string,
): Promise<{ data: StorefrontResponse; product: StorefrontProduct | null } | null> {
  const data = await getStorefront(slug);
  if (!data) return null;
  const product = data.available ? (data.products.find((p) => String(p.id) === productId) ?? null) : null;
  return { data, product };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, productId } = await params;
  const result = await getProduct(slug, productId);
  if (!result?.product) return {};

  const { data, product } = result;
  // e.g. "Romper set — KES 1,000 | Shop name" - what WhatsApp/Facebook show
  // in the link preview, alongside the product photo.
  // Owner's per-product "Search title"/"Search description" win when set.
  const title = product.seoTitle?.trim()
    ? clampText(`${product.seoTitle} | ${data.shop.name}`, 70)
    : `${product.name} — ${formatPriceSummary(product)} | ${data.shop.name}`;
  const city = data.shop.seo?.city ? ` in ${data.shop.seo.city}` : '';
  const description = clampText(
    product.seoDescription?.trim() ||
      product.description ||
      `${product.name} at ${data.shop.name}${city}, ${formatPriceSummary(product)}. Order on WhatsApp in a tap.`,
    160,
  );
  const image = productImage(product);
  const images = image ? [{ url: image, alt: product.name }] : undefined;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: productPath(data.shop.slug, product.id) },
    robots: shopRobots(data.shop),
    openGraph: {
      title,
      description,
      type: 'website',
      url: productUrl(data.shop.slug, product.id),
      siteName: data.shop.name,
      images,
    },
    twitter: { card: images ? 'summary_large_image' : 'summary', title, description, images: image ? [image] : undefined },
  };
}

const AVAILABILITY_LABEL = { in_stock: 'In stock', low: 'Last pieces', sold_out: 'Sold out' } as const;

export default async function ShopProductPage({ params }: { params: Params }) {
  const { slug, productId } = await params;
  const result = await getProduct(slug, productId);
  if (!result) notFound();

  const { data, product } = result;
  const { shop } = data;
  // Paused shop: product links shared earlier go to the shop page, which
  // renders the polite "taking a short break - WhatsApp us" view.
  if (!data.available) redirect(shopPath(shop.slug));
  // Product no longer listed (hidden, deactivated, deleted).
  if (!product) notFound();

  const image = productImage(product);
  const soldOut = product.availability === 'sold_out';
  const hasVariants = product.variants.length > 0;
  const singleOrderLink = !hasVariants && !soldOut ? productOrderLink(shop, product) : null;
  const askLink = shopOrderLink(shop);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description ?? undefined,
    image: image ?? undefined,
    category: product.category,
    brand: { '@type': 'Brand', name: shop.name },
    offers: (hasVariants ? product.variants : [null]).map((variant) => ({
      '@type': 'Offer',
      name: variant?.label,
      price: variant ? variant.price : product.price,
      priceCurrency: 'KES',
      url: productUrl(shop.slug, product.id),
      availability:
        (variant?.availability ?? product.availability) === 'sold_out'
          ? 'https://schema.org/OutOfStock'
          : (variant?.availability ?? product.availability) === 'low'
            ? 'https://schema.org/LimitedAvailability'
            : 'https://schema.org/InStock',
    })),
  };

  return (
    <ShopShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />

      <header className="border-b border-[#eadfd3]">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link
            href={shopPath(shop.slug)}
            className="flex min-w-0 items-center gap-2 text-sm text-stone-600 hover:text-stone-900"
          >
            <span aria-hidden>←</span>
            <span className="truncate font-serif text-base font-semibold text-stone-900">{shop.name}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">
        <div className="grid gap-6 md:grid-cols-2 md:gap-10">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-[#eadfd3] bg-[#f6eee5]">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt={product.name}
                className={cn('h-full w-full object-cover', soldOut && 'grayscale')}
              />
            ) : (
              <ImagePlaceholder name={product.name} className="text-7xl" />
            )}
            <AvailabilityBadge availability={product.availability} className="absolute top-3 left-3" />
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.25em] text-[#a07e5f] uppercase">{product.category}</p>
            <h1 className="mt-2 font-serif text-2xl leading-tight font-semibold break-words text-stone-900 sm:text-3xl">
              {product.name}
            </h1>
            <p className={cn('mt-2 text-xl font-semibold text-[#8a5a33]', soldOut && 'text-stone-500')}>
              {formatPriceSummary(product)}
            </p>

            {product.description ? (
              <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-stone-700 sm:text-base">
                {product.description}
              </p>
            ) : null}

            {hasVariants ? (
              <section className="mt-6">
                <h2 className="text-sm font-semibold text-stone-900">Choose an option</h2>
                <ul className="mt-3 divide-y divide-[#eadfd3] overflow-hidden rounded-2xl border border-[#eadfd3] bg-white">
                  {product.variants.map((variant) => {
                    const variantSoldOut = variant.availability === 'sold_out';
                    const link = variantSoldOut ? null : productOrderLink(shop, product, variant);
                    const thumb = absoluteImage(variant.image);
                    return (
                      <li
                        key={variant.id || variant.label}
                        className={cn('flex flex-wrap items-center gap-3 p-3', variantSoldOut && 'opacity-60')}
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt={`${product.name} - ${variant.label}`}
                            loading="lazy"
                            className={cn('size-12 shrink-0 rounded-lg object-cover', variantSoldOut && 'grayscale')}
                          />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-stone-900">{variant.label}</p>
                          <p className="text-xs text-stone-500">
                            {formatKes(variant.price)} · {AVAILABILITY_LABEL[variant.availability]}
                          </p>
                        </div>
                        {link ? (
                          <WhatsAppOrderButton href={link} label="Order" size="sm" />
                        ) : variantSoldOut ? (
                          <span className="text-xs text-stone-500">Sold out</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : (
              <div className="mt-6">
                {singleOrderLink ? (
                  <WhatsAppOrderButton href={singleOrderLink} size="lg" className="w-full sm:w-auto" />
                ) : soldOut ? (
                  <p className="text-sm text-stone-600">
                    This piece is sold out right now.
                    {askLink ? ' WhatsApp us to ask when it is back.' : ''}
                  </p>
                ) : null}
              </div>
            )}

            {soldOut && askLink ? (
              <div className="mt-4">
                <WhatsAppOrderButton href={askLink} label="Ask about restock" size="md" />
              </div>
            ) : null}

            <p className="mt-6 text-xs text-stone-500">
              Tap the button to send us your order on WhatsApp — we&apos;ll confirm availability, payment and delivery.
            </p>
          </div>
        </div>
      </main>

      <ShopFooter />
    </ShopShell>
  );
}
