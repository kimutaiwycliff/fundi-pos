// Composite key for per-(product, variant) stock lookups, shared by every
// screen that reads /api/reports/stock-levels (Sell, Products, Inventory) -
// a bare variant id isn't unique across products, and "no variant" still
// needs a stable key of its own (empty string) so a variant-less product's
// stock is never confused with a variant that happened to be selected.
export function stockKey(productId: number, variantId?: string | null): string {
  return `${productId}::${variantId ?? ''}`;
}
