import { cache } from 'react';
import { buildWhatsAppLink } from '@hardware-pos/business-logic';
import { payloadPublicFetch, PayloadApiError } from '@/lib/payload-public-client';

// Shapes returned by apps/api's PUBLIC GET /api/storefront/{slug} (the
// "Sell Online" add-on feed). Only whitelisted, customer-safe fields.
export type Availability = 'in_stock' | 'low' | 'sold_out';

// One product/variant photo with its resized copies (thumb ~240w, card
// ~640w, large ~1600w). Older uploads repeat `url` for every size.
export interface StorefrontPhoto {
  url: string;
  thumb: string;
  card: string;
  large: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface StorefrontVariant {
  id: string;
  label: string;
  price: number;
  // Card-size cover (kept for older readers); `images` is the full set.
  image: string | null;
  images?: StorefrontPhoto[];
  availability: Availability;
}

export interface StorefrontProduct {
  id: number;
  name: string;
  category: string;
  description: string | null;
  price: number;
  // Card-size cover; `images` = cover + gallery (optional on older APIs).
  image: string | null;
  images?: StorefrontPhoto[];
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
    const data = await payloadPublicFetch<StorefrontResponse>(
      `/api/storefront/${encodeURIComponent(slug)}`,
      STOREFRONT_REVALIDATE_SECONDS,
    );
    return resolveMediaUrls(data);
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

// Production media lives on R2 (absolute URLs). Without R2 (local dev,
// self-hosting) Payload returns "/api/media/file/..." paths; setting the
// server-only PAYLOAD_PUBLIC_MEDIA_BASE (e.g. http://localhost:3011) makes
// those absolute before they reach the page. Unset = untouched.
function resolveMediaUrls(data: StorefrontResponse): StorefrontResponse {
  const base = process.env.PAYLOAD_PUBLIC_MEDIA_BASE?.replace(/\/+$/, '');
  if (!base || !data?.products) return data;
  const fix = <T extends string | null | undefined>(url: T): T => (url && url.startsWith('/') ? (`${base}${url}` as T) : url);
  const fixPhotos = (list?: StorefrontPhoto[]) =>
    list?.map((p) => ({ ...p, url: fix(p.url), thumb: fix(p.thumb), card: fix(p.card), large: fix(p.large) }));
  return {
    ...data,
    shop: data.shop.seo ? { ...data.shop, seo: { ...data.shop.seo, image: fix(data.shop.seo.image) } } : data.shop,
    products: data.products.map((product) => ({
      ...product,
      image: fix(product.image),
      images: fixPhotos(product.images),
      variants: product.variants.map((v) => ({ ...v, image: fix(v.image), images: fixPhotos(v.images) })),
    })),
  };
}

// Renderable photos only (absolute URLs). A size that isn't absolute falls
// back to the original. Older API responses without `images` get a single
// photo built from the card-size `image`.
function usablePhotos(list: StorefrontPhoto[] | undefined, fallback: string | null): StorefrontPhoto[] {
  const out: StorefrontPhoto[] = [];
  for (const p of list ?? []) {
    const url = absoluteImage(p.url) ?? absoluteImage(p.large) ?? absoluteImage(p.card);
    if (!url) continue;
    out.push({
      ...p,
      url,
      thumb: absoluteImage(p.thumb) ?? url,
      card: absoluteImage(p.card) ?? url,
      large: absoluteImage(p.large) ?? url,
    });
  }
  if (out.length === 0) {
    const single = absoluteImage(fallback);
    if (single) out.push({ url: single, thumb: single, card: single, large: single, alt: null, width: null, height: null });
  }
  return out;
}

function dedupePhotos(list: StorefrontPhoto[]): StorefrontPhoto[] {
  const seen = new Set<string>();
  return list.filter((p) => (seen.has(p.url) ? false : (seen.add(p.url), true)));
}

export function productPhotos(product: StorefrontProduct): StorefrontPhoto[] {
  return usablePhotos(product.images, product.image);
}

export function variantPhotos(variant: StorefrontVariant | null | undefined): StorefrontPhoto[] {
  return variant ? usablePhotos(variant.images, variant.image) : [];
}

// What the product page shows: the chosen variant's photos first, then the
// product's shared photos. With no variant chosen: the product's photos
// followed by every variant's (so nothing uploaded is hidden).
export function galleryPhotos(product: StorefrontProduct, variant: StorefrontVariant | null): StorefrontPhoto[] {
  if (variant) return dedupePhotos([...variantPhotos(variant), ...productPhotos(product)]);
  return dedupePhotos([...productPhotos(product), ...product.variants.flatMap((v) => variantPhotos(v))]);
}

// Every photo of the product (JSON-LD wants them all).
export function allProductPhotos(product: StorefrontProduct): StorefrontPhoto[] {
  return galleryPhotos(product, null);
}

// Width descriptors for <img srcSet>; skips sizes that fell back to the same
// file so the browser never sees one URL claiming two widths.
export function photoSrcSet(photo: StorefrontPhoto, sizes: Array<'thumb' | 'card' | 'large'> = ['thumb', 'card', 'large']): string | undefined {
  const widths = { thumb: 240, card: 640, large: 1600 } as const;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const size of sizes) {
    const url = photo[size];
    if (seen.has(url)) continue;
    seen.add(url);
    // Resizes never upscale: a 1200px original's "large" is 1200px wide.
    const width = photo.width ? Math.min(widths[size], photo.width) : widths[size];
    parts.push(`${url} ${width}w`);
  }
  return parts.length > 1 ? parts.join(', ') : undefined;
}

// Card-size cover for grids, link previews and anywhere one photo is shown.
export function productImage(product: StorefrontProduct): string | null {
  return productPhotos(product)[0]?.card ?? product.variants.map((v) => variantPhotos(v)[0]?.card).find(Boolean) ?? null;
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
