import { API_BASE_URL } from './auth';

// Shared REST-backed catalog + stock-level fetchers, used by every screen
// that used to read the PowerSync-synced `products`/`products_variants`/
// `stock_movements` tables directly (SellScreen, VariantPickerModal,
// ProductsScreen, InventoryScreen, StockAdjustmentModal, RestockScreen,
// NewQuotationScreen, QuoteVariantPickerModal). Mirrors apps/web's own
// "fetch everything once, filter/search client-side" pattern (dashboard/
// sell/page.tsx + product-search.tsx) rather than PowerSync's live local
// SQLite queries - there is no local database anymore, so this app is
// online-only, same as apps/web.

export interface CatalogVariant {
  id: string;
  label: string;
  sku: string;
  barcode: string | null;
  sellPrice: number | null;
  costPrice: number | null;
  imageId: number | null;
  imageUrl: string | null;
}

export interface CatalogProduct {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  category: string | null;
  sellPrice: number;
  // 0 when Products.ts's field-level access hides this from a cashier -
  // Payload just omits the field from the response rather than sending
  // null, so this always resolves to a real number either way.
  costPrice: number;
  taxRate: number;
  maxDiscountAmount: number;
  reorderPoint: number;
  isActive: boolean;
  isBundle: boolean;
  imageId: number | null;
  imageUrl: string | null;
  variants: CatalogVariant[];
  relatedProducts: number[];
}

interface RawImage {
  id?: number;
  url?: string;
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

function imageUrlOf(image: RawImage | number | null | undefined): string | null {
  if (image == null || typeof image !== 'object') return null;
  return image.url ?? null;
}

function mapVariant(v: RawVariant): CatalogVariant {
  return {
    id: v.id ?? '',
    label: v.label ?? '',
    sku: v.sku ?? '',
    barcode: v.barcode ?? null,
    sellPrice: v.sellPrice ?? null,
    costPrice: v.costPrice ?? null,
    imageId: imageIdOf(v.image),
    imageUrl: imageUrlOf(v.image),
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
    imageId: imageIdOf(p.image),
    imageUrl: imageUrlOf(p.image),
    variants: (p.variants ?? []).map(mapVariant),
    relatedProducts: (p.relatedProducts ?? []).map((r) => (typeof r === 'object' ? r.id : r)),
  };
}

/**
 * Whole tenant catalog in one shot (same "fetch everything, filter/search in
 * memory" shape as the old reactive useQuery this replaces, and as apps/web's
 * own dashboard/sell/page.tsx) - depth=1 populates each product's own image
 * and each variant's own image, so no separate media lookup is needed.
 */
export async function fetchCatalog(payloadToken: string, tenantId: number, opts?: { activeOnly?: boolean }): Promise<CatalogProduct[]> {
  try {
    const activeFilter = opts?.activeOnly === false ? '' : '&where[isActive][equals]=true';
    const res = await fetch(
      `${API_BASE_URL}/api/products?where[tenant][equals]=${tenantId}${activeFilter}&sort=name&limit=5000&depth=1`,
      { headers: { Authorization: `JWT ${payloadToken}` } },
    );
    if (!res.ok) return [];
    const body = await res.json().catch(() => null);
    const docs = (body?.docs ?? []) as RawProduct[];
    return docs.map(mapProduct);
  } catch {
    return [];
  }
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

/** Per-(product, variant) on-hand quantity for one store - GET /api/reports/stock-levels, the same endpoint apps/web/apps/desktop already use. */
export async function fetchStockLevels(payloadToken: string, storeId: number): Promise<StockLevelRow[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/reports/stock-levels?store=${storeId}`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => null);
    return (body?.levels ?? []) as StockLevelRow[];
  } catch {
    return [];
  }
}

/** Composite key for per-(product, variant) stock lookups - matches sell/types.ts's stockKey, just accepting a numeric productId (this module's own CatalogProduct.id) instead of a string one. */
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
