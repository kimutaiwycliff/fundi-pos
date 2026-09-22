import { apiFetch, API_BASE_URL } from './auth';
import type { LocalVariant } from './VariantPickerDialog';

// Desktop's own REST equivalent of apps/mobile/src/lib/catalog.ts (that app's
// PowerSync-removal counterpart) - same two endpoints (`/api/products`,
// `/api/reports/stock-levels`), same camelCase response shape, ported here
// rather than imported since this is a different bundler/app entirely.
// Unlike mobile's version, these throw on failure instead of swallowing
// errors into an empty array - every caller here is expected to surface a
// clear "you're offline"/error message (this app's own hard requirement),
// not silently render an empty catalog that looks identical to "no products".

export interface CatalogVariant {
  id: string;
  label: string;
  sku: string;
  barcode: string | null;
  sellPrice: number | null;
  costPrice: number | null;
  // Bare media doc id - Payload's `depth` param doesn't reliably populate an
  // upload field nested inside an array (confirmed against this same list
  // endpoint), so this is never a populated doc. ProductsScreen.tsx resolves
  // it to an actual URL via a separately-fetched mediaUrlById map
  // (products.ts's fetchMediaUrlMap) - same "load once, join client-side"
  // pattern apps/web's dashboard pages already use for this exact field.
  image: number | null;
}

export interface CatalogProduct {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  category: string | null;
  sellPrice: number;
  costPrice: number;
  taxRate: number;
  maxDiscountAmount: number;
  reorderPoint: number;
  isActive: boolean;
  isBundle: boolean;
  // Bare media doc id - see CatalogVariant.image's own comment above.
  image: number | null;
  relatedProducts: number[];
  variants: CatalogVariant[];
}

interface RawImage {
  id?: number;
}

interface RawVariant {
  id?: string;
  label?: string;
  sku?: string | null;
  barcode?: string | null;
  sellPrice?: number | null;
  costPrice?: number | null;
  image?: RawImage | number | null;
}

interface RawProduct {
  id: number;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  sellPrice?: number;
  costPrice?: number;
  taxRate?: number;
  maxDiscountAmount?: number;
  reorderPoint?: number;
  isActive?: boolean;
  isBundle?: boolean;
  image?: RawImage | number | null;
  variants?: RawVariant[];
  relatedProducts?: Array<number | { id: number }>;
}

function imageIdOf(image: RawImage | number | null | undefined): number | null {
  if (image == null) return null;
  return typeof image === 'object' ? (image.id ?? null) : image;
}

function mapVariant(v: RawVariant): CatalogVariant {
  return {
    id: v.id ?? '',
    label: v.label ?? '',
    sku: v.sku ?? '',
    barcode: v.barcode ?? null,
    sellPrice: v.sellPrice ?? null,
    costPrice: v.costPrice ?? null,
    image: imageIdOf(v.image),
  };
}

function mapProduct(p: RawProduct): CatalogProduct {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku ?? '',
    barcode: p.barcode ?? null,
    category: p.category ?? null,
    sellPrice: p.sellPrice ?? 0,
    costPrice: p.costPrice ?? 0,
    taxRate: p.taxRate ?? 0,
    maxDiscountAmount: p.maxDiscountAmount ?? 0,
    reorderPoint: p.reorderPoint ?? 0,
    isActive: p.isActive !== false,
    isBundle: p.isBundle === true,
    image: imageIdOf(p.image),
    relatedProducts: (p.relatedProducts ?? []).map((r) => (typeof r === 'object' ? r.id : r)),
    variants: (p.variants ?? []).map(mapVariant),
  };
}

/**
 * Tenant-wide product catalog (base products + their variants, nested via
 * `depth=1`) - every screen that used to read products/products_variants
 * locally (Till.tsx, InventoryScreen.tsx, RestockScreen.tsx,
 * QuotationsScreen.tsx) now calls this instead. Throws on a non-2xx response
 * or a connectivity failure (apiFetch turns that into a friendly
 * "you're offline" Error) - callers should catch and show it, not swallow it.
 */
export async function fetchCatalog(payloadToken: string, tenantId: number, opts?: { activeOnly?: boolean }): Promise<CatalogProduct[]> {
  const activeFilter = opts?.activeOnly === false ? '' : '&where[isActive][equals]=true';
  const res = await apiFetch(
    `${API_BASE_URL}/api/products?where[tenant][equals]=${tenantId}${activeFilter}&sort=name&limit=5000&depth=1`,
    { headers: { Authorization: `JWT ${payloadToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Could not load products (HTTP ${res.status})`);
  }
  const body = await res.json().catch(() => null);
  const docs = (body?.docs ?? []) as RawProduct[];
  return docs.map(mapProduct);
}

export interface StockLevelRow {
  store: number;
  product: number;
  variant: string | null;
  productName: string;
  variantLabel: string | null;
  quantity: number;
  reorderPoint: number;
  lowStock: boolean;
}

/** Same tenant-wide/store-scoped `/api/reports/stock-levels` endpoint web/mobile use. */
export async function fetchStockLevels(payloadToken: string, storeId: number): Promise<StockLevelRow[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/reports/stock-levels?store=${storeId}`, {
    headers: { Authorization: `JWT ${payloadToken}` },
  });
  if (!res.ok) {
    throw new Error(`Could not load stock levels (HTTP ${res.status})`);
  }
  const body = await res.json().catch(() => null);
  return (body?.levels ?? []) as StockLevelRow[];
}

export function stockKey(productId: number | string, variantId?: string | null): string {
  return `${productId}::${variantId ?? ''}`;
}

export function stockByKeyMap(levels: StockLevelRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const level of levels) {
    map.set(stockKey(level.product, level.variant), level.quantity);
  }
  return map;
}

/** Maps a catalog product's nested variants into VariantPickerDialog's own (stock-aware) shape - shared by every screen that opens that dialog (Till.tsx, QuotationsScreen.tsx), so the mapping only lives once. */
export function toLocalVariants(product: CatalogProduct, stockByKey: Map<string, number>): LocalVariant[] {
  return product.variants.map((v) => ({
    id: v.id,
    label: v.label,
    sku: v.sku,
    barcode: v.barcode,
    sell_price: v.sellPrice,
    cost_price: v.costPrice,
    stock_on_hand: stockByKey.get(stockKey(product.id, v.id)) ?? 0,
  }));
}
