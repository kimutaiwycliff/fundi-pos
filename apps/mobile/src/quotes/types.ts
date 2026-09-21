// Local-DB-shaped product/variant types for the quotation builder's product
// search - deliberately separate from sell/types.ts's LocalProduct/
// LocalVariant/CartLine, which carry stock_on_hand/max_discount_amount
// fields tied to sell-flow concepts (discount caps, stock gating) that don't
// apply to a quotation line (free-text pricing, no stock check).
export interface QuoteProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sell_price: number;
  variant_count: number;
  image_url: string | null;
}

export interface QuoteVariant {
  id: string;
  label: string;
  sku: string;
  barcode: string | null;
  sell_price: number | null;
  image_url: string | null;
}

/** A variant's own price only when it explicitly sets one - most variants share the parent's price. */
export function quoteLineUnitPrice(product: QuoteProduct, variant: QuoteVariant | null): number {
  return variant?.sell_price ?? product.sell_price;
}

export function quoteLineLabel(product: QuoteProduct, variant: QuoteVariant | null): string {
  return variant ? `${product.name} — ${variant.label}` : product.name;
}
