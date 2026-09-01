import { Suspense } from 'react';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { BranchFilter } from '@/components/branch-filter';
import { ProductDialog } from './product-dialog';
import { ProductsTable } from './products-table';
import { ImportProductsDialog } from './import-dialog';
import { ProductStatusFilter } from './status-filter';

type Store = { id: number; name: string };

export type Variant = {
  id?: string;
  label: string;
  sku: string;
  barcode?: string | null;
  sellPrice?: number | null;
  // Absent entirely from the API response for non-owners (same field-level
  // access as the product-level costPrice below) - never assume it's there.
  costPrice?: number | null;
  // Bare media doc id (depth=0, see below) - null/undefined means "use the
  // product's own image." Look up the actual URL via mediaUrlById.
  image?: number | null;
};

export type Product = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  category: string | null;
  // Absent entirely from the API response for non-owners (Products.ts's
  // field-level access.read) - never assume it's there.
  costPrice?: number;
  sellPrice: number;
  taxRate: number;
  reorderPoint?: number;
  maxDiscountAmount?: number;
  isActive: boolean;
  variants: Variant[];
  // Bare media doc id (depth=0, see below), not a populated doc - look up
  // the actual URL via mediaUrlById.
  image?: number | null;
  // Fetched at depth=0 below, so relations come back as bare ids, not
  // populated docs - keeps a 500-product catalog fetch cheap.
  relatedProducts: number[];
};

export interface StockLevel {
  store: number;
  product: number;
  variant: string | null;
  variantLabel: string | null;
  quantity: number;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; status?: string }>;
}) {
  const { store, status } = await searchParams;
  const archived = status === 'archived';
  const [{ docs: products }, { docs: stores }, me, { levels: stockLevels }, { docs: mediaDocs }] = await Promise.all([
    payloadFetch<{ docs: Product[] }>(
      `/api/products?sort=-createdAt&limit=500&depth=0&where[isActive][equals]=${archived ? 'false' : 'true'}`,
    ),
    payloadFetch<{ docs: Store[] }>('/api/stores?sort=name&limit=100'),
    getCurrentUser(),
    payloadFetch<{ levels: StockLevel[] }>('/api/reports/stock-levels'),
    // Products/variants only store a bare media id at depth=0 - resolved
    // against actual URLs client-side via this map, same "load once, join
    // client-side" pattern as branchStock above.
    payloadFetch<{ docs: { id: number; url: string }[] }>('/api/media?limit=1000&depth=0'),
  ]);
  const canSeeCost = me.role === 'owner';
  const mediaUrlById: Record<number, string> = Object.fromEntries(mediaDocs.map((m) => [m.id, m.url]));

  // Products are tenant-wide, not store-owned - a branch toggle here can't
  // filter the catalog itself, only annotate each row with that branch's
  // stock-on-hand (which genuinely is per-store). Summed across variants -
  // a variant-having product now has one stock-levels row per variant, not
  // one, so this can no longer just take the last row per product id.
  let branchStock: Record<number, number> | null = null;
  let branchName: string | null = null;
  if (store) {
    const levels = stockLevels.filter((l) => String(l.store) === store);
    branchStock = {};
    for (const level of levels) {
      branchStock[level.product] = (branchStock[level.product] ?? 0) + level.quantity;
    }
    branchName = stores.find((s) => String(s.id) === store)?.name ?? null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Products</h1>
        <div className="flex flex-wrap gap-2">
          <ProductStatusFilter />
          <Suspense fallback={null}>
            <BranchFilter stores={stores} />
          </Suspense>
          <ImportProductsDialog stores={stores} />
          <ProductDialog
            stores={stores}
            allProducts={products}
            stockLevels={stockLevels}
            canSeeCost={canSeeCost}
            mediaUrlById={mediaUrlById}
          />
        </div>
      </div>

      <ProductsTable
        products={products}
        canSeeCost={canSeeCost}
        branchStock={branchStock}
        branchName={branchName}
        stores={stores}
        stockLevels={stockLevels}
        archivedView={archived}
        mediaUrlById={mediaUrlById}
      />
    </div>
  );
}
