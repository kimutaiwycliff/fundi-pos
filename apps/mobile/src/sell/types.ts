// Local-DB-shaped equivalents of apps/web/src/app/dashboard/sell/types.ts +
// stock-key.ts, adapted for mobile's offline query pattern: products and
// products_variants are separate flat SQLite tables here (schema.ts), not a
// single server response with a nested `variants` array, so stock/variant
// data is fetched on demand (search results, then a per-product variant
// query when the picker opens) rather than loaded all at once.
export interface LocalProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sell_price: number;
  tax_rate: number;
  max_discount_amount: number;
  stock_on_hand: number;
  variant_count: number;
  image_url: string | null;
}

export interface LocalVariant {
  id: string;
  label: string;
  sku: string;
  barcode: string | null;
  sell_price: number | null;
  stock_on_hand: number;
  image_url: string | null;
}

export interface CartLine {
  product: LocalProduct;
  // null = the bare product (no variants). A product with variants is never
  // sold as itself - see SellScreen's requestAdd, which forces a variant
  // pick first, matching web's identical rule.
  variant: LocalVariant | null;
  quantity: number;
  // Flat currency amount off this line's subtotal (not a percentage) -
  // matches apps/desktop/src/Till.tsx's CartLine.discountAmount and web's
  // CartLine.discountAmount.
  discountAmount: number;
}

export type TenderType = 'cash' | 'mpesa' | 'credit';

/** Composite key for per-(product, variant) stock/cart lookups - a bare variantId of '' still needs a stable key distinct from any real variant id. */
export function stockKey(productId: string, variantId?: string | null): string {
  return `${productId}::${variantId ?? ''}`;
}

/** A variant's own price only when it explicitly sets one - most variants share the parent's price. */
export function lineUnitPrice(line: Pick<CartLine, 'product' | 'variant'>): number {
  return line.variant?.sell_price ?? line.product.sell_price;
}

export function lineDisplayLabel(line: Pick<CartLine, 'product' | 'variant'>): string {
  return line.variant ? `${line.product.name} — ${line.variant.label}` : line.product.name;
}

/** max_discount_amount is a per-unit currency cap (see apps/web/.../sell-client.tsx's identically-named helper) - the line's ceiling scales with quantity. */
export function maxDiscountAmountForLine(line: Pick<CartLine, 'quantity' | 'product'>): number {
  return line.quantity * line.product.max_discount_amount;
}
