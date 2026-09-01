import type { Product } from './page';

export interface CartLine {
  product: Product;
  // null = the product itself (no variant picked / product has none).
  // A product with variants is never sold as its bare self - see
  // sell-client.tsx's requestAdd, which forces a variant pick first.
  variantId: string | null;
  quantity: number;
  // A flat currency amount off this line's subtotal (not a percentage) -
  // mirrors apps/desktop/src/Till.tsx's CartLine.discountAmount.
  discountAmount: number;
}

export type TenderType = 'cash' | 'mpesa' | 'credit';

export function resolveVariant(product: Product, variantId: string | null) {
  if (!variantId) return null;
  return product.variants.find((v) => v.id === variantId) ?? null;
}

// A variant's own price only when it explicitly sets one - most variants
// (color/size options) share the parent's price, so null/undefined falls
// back to it rather than every variant needing its own copy of the price.
export function lineUnitPrice(product: Product, variantId: string | null): number {
  return resolveVariant(product, variantId)?.sellPrice ?? product.sellPrice;
}

export function lineDisplayLabel(product: Product, variantId: string | null): string {
  const variant = resolveVariant(product, variantId);
  return variant ? `${product.name} — ${variant.label}` : product.name;
}
