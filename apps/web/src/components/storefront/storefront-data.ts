import { cache } from 'react';
import { buildWhatsAppLink } from '@hardware-pos/business-logic';
import { payloadPublicFetch, PayloadApiError } from '@/lib/payload-public-client';

// Shapes returned by apps/api's PUBLIC GET /api/storefront/{slug} (the
// "Sell Online" add-on feed). Only whitelisted, customer-safe fields.
export type Availability = 'in_stock' | 'low' | 'sold_out';

export interface StorefrontVariant {
  id: string;
  label: string;
  price: number;
  image: string | null;
  availability: Availability;
}

export interface StorefrontProduct {
  id: number;
  name: string;
  category: string;
  description: string | null;
  price: number;
  image: string | null;
  availability: Availability;
  variants: StorefrontVariant[];
  // Optional owner overrides for search results (Products.seoTitle/...).
  seoTitle?: string | null;
  seoDescription?: string | null;
  updatedAt?: string | null;
}

// Settings -> Online shop -> Search engines. Optional on older API responses.
export interface StorefrontSeo {
  title: string | null;
  description: string | null;
  image: string | null;
  city: string | null;
  indexable: boolean;
  googleSiteVerification: string | null;
}

// Settings -> Online shop -> Delivery & payment. Optional on older API
// responses; every part is only shown when the owner filled it in.
export interface StorefrontDelivery {
  zones: Array<{ name: string; fee: number; eta: string | null }>;
  freeThreshold: number | null;
  payOnDelivery: boolean;
  sameDayCutoff: string | null;
  sameDayArea: string | null;
}

export interface StorefrontShop {
  name: string;
  slug: string;
  tagline: string | null;
  whatsappNumber: string | null;
  socialHandles: string | null;
  updatedAt?: string | null;
  seo?: StorefrontSeo;
  delivery?: StorefrontDelivery;
}

// Google shows ~60 title chars / ~155 description chars - trim on a word
// boundary rather than letting it cut mid-word.
export function clampText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).trim()}…`;
}

export function shopSeoTitle(shop: StorefrontShop): string {
  if (shop.seo?.title?.trim()) return clampText(shop.seo.title, 70);
  const where = shop.seo?.city ? ` in ${shop.seo.city}` : '';
  return clampText(shop.tagline ? `${shop.name}${where} — ${shop.tagline}` : `${shop.name}${where} — Shop online`, 70);
}

export function shopSeoDescription(shop: StorefrontShop): string {
  if (shop.seo?.description?.trim()) return clampText(shop.seo.description, 160);
  const where = shop.seo?.city ? ` in ${shop.seo.city}` : '';
  return clampText(`${shop.tagline ? `${shop.tagline}. ` : ''}Shop ${shop.name}${where} online — order on WhatsApp in a tap.`, 160);
}

// "Show my shop on Google" off => keep the shop working for customers with
// the link, but ask search engines not to list it.
export function shopRobots(shop: StorefrontShop): { index: boolean; follow: boolean } {
  const indexable = shop.seo?.indexable !== false;
  return { index: indexable, follow: indexable };
}

export interface StorefrontResponse {
  available: boolean;
  shop: StorefrontShop;
  products: StorefrontProduct[];
}

// Same base the root layout uses for metadataBase - shared links (WhatsApp
// messages, OG urls) must be absolute.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://app.fundipos.co.ke').replace(/\/+$/, '');

export const STOREFRONT_REVALIDATE_SECONDS = 60;

// Wrapped in React cache() so generateMetadata and the page share one
// request per render (fetch's Data Cache also dedupes, this is belt+braces).
// Returns null for 404 (unknown / suspended shop) so callers can notFound();
// anything else (500s, API down) is rethrown to the error boundary.
export const getStorefront = cache(async (slug: string): Promise<StorefrontResponse | null> => {
  try {
    return await payloadPublicFetch<StorefrontResponse>(
      `/api/storefront/${encodeURIComponent(slug)}`,
      STOREFRONT_REVALIDATE_SECONDS,
    );
  } catch (error) {
    if (error instanceof PayloadApiError && error.status === 404) return null;
    throw error;
  }
});

const kesFormatter = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 });

export function formatKes(amount: number): string {
  return `KES ${kesFormatter.format(amount)}`;
}

// Only absolute URLs are rendered - relative Payload media paths would
// resolve against this web app's origin, not the API's, and 404.
export function absoluteImage(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export function productImage(product: StorefrontProduct): string | null {
  return absoluteImage(product.image) ?? absoluteImage(product.variants.find((v) => absoluteImage(v.image))?.image);
}

export interface PriceSummary {
  amount: number;
  from: boolean;
}

export function priceSummary(product: StorefrontProduct): PriceSummary {
  if (product.variants.length === 0) return { amount: product.price, from: false };
  const prices = product.variants.map((v) => v.price);
  const min = Math.min(...prices);
  return { amount: min, from: prices.some((p) => p !== min) };
}

export function formatPriceSummary(product: StorefrontProduct): string {
  const { amount, from } = priceSummary(product);
  return `${from ? 'from ' : ''}${formatKes(amount)}`;
}

export function shopPath(slug: string): string {
  return `/shop/${encodeURIComponent(slug)}`;
}

export function productPath(slug: string, productId: number | string): string {
  return `${shopPath(slug)}/p/${encodeURIComponent(String(productId))}`;
}

export function productUrl(slug: string, productId: number | string): string {
  return `${SITE_URL}${productPath(slug, productId)}`;
}

export function shopUrl(slug: string): string {
  return `${SITE_URL}${shopPath(slug)}`;
}

export function productOrderLink(
  shop: StorefrontShop,
  product: StorefrontProduct,
  variant?: StorefrontVariant,
): string | null {
  const name = variant ? `${product.name} (${variant.label})` : product.name;
  const price = variant ? variant.price : priceSummary(product).amount;
  const message = `Hi ${shop.name}! I'd like to order: ${name} — ${formatKes(price)}. Link: ${productUrl(shop.slug, product.id)}`;
  return buildWhatsAppLink(shop.whatsappNumber, message);
}

export function shopOrderLink(shop: StorefrontShop): string | null {
  return buildWhatsAppLink(shop.whatsappNumber, `Hi ${shop.name}! I'd like to place an order. (${shopUrl(shop.slug)})`);
}

export function categoryAnchor(category: string): string {
  const slug = category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `cat-${slug || 'other'}`;
}

export function groupByCategory(products: StorefrontProduct[]): Array<{ category: string; products: StorefrontProduct[] }> {
  const groups = new Map<string, StorefrontProduct[]>();
  for (const product of products) {
    const category = product.category?.trim() || 'Other';
    const list = groups.get(category);
    if (list) list.push(product);
    else groups.set(category, [product]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))
    .map(([category, items]) => ({ category, products: items }));
}

// JSON-LD is user-controlled text (shop/product names) inside a <script> -
// escape "<" so a name containing "</script>" can't break out.
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
