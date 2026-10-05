import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import {
  clampText,
  shopRobots,
  formatPriceSummary,
  getStorefront,
  jsonLdString,
  productImage,
  productPath,
  productUrl,
  shopPath,
  type StorefrontProduct,
  type StorefrontResponse,
} from '@/components/storefront/storefront-data';
import { ShopFooter, ShopShell } from '@/components/storefront/storefront-ui';
import { ProductDetail, RecentlyViewed, RelatedProducts, ShopTopBar } from '@/components/storefront/shop-client';

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

// "You may also like": same category first, then anything else in stock,
// never the product itself - 8 at most.
function relatedFor(product: StorefrontProduct, all: StorefrontProduct[]): StorefrontProduct[] {
  const others = all.filter((p) => p.id !== product.id);
  const sameCategory = others.filter((p) => p.category === product.category && p.availability !== 'sold_out');
  const rest = others.filter((p) => p.category !== product.category && p.availability !== 'sold_out');
  return [...sameCategory, ...rest].slice(0, 8);
}

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
  const hasVariants = product.variants.length > 0;
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
      <ShopTopBar shop={shop} products={data.products} back />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 sm:pt-10">
        <ProductDetail shop={shop} product={product} />
        <RelatedProducts shop={shop} products={relatedFor(product, data.products)} />
        <RecentlyViewed shop={shop} products={data.products} excludeId={product.id} />
      </main>
      <ShopFooter shopName={shop.name} socialHandles={shop.socialHandles} />
    </ShopShell>
  );
}
