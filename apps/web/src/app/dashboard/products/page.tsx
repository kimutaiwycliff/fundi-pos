import { Suspense } from 'react';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { BranchFilter } from '@/components/branch-filter';
import { ProductDialog } from './product-dialog';
import { ProductsTable } from './products-table';
import { ImportProductsDialog } from './import-dialog';

type Store = { id: number; name: string };

type Product = {
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
  maxDiscountPercent?: number;
};

interface StockLevel {
  store: number;
  product: number;
  quantity: number;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { store } = await searchParams;
  const [{ docs: products }, { docs: stores }, me] = await Promise.all([
    payloadFetch<{ docs: Product[] }>('/api/products?sort=-createdAt&limit=500'),
    payloadFetch<{ docs: Store[] }>('/api/stores?sort=name&limit=100'),
    getCurrentUser(),
  ]);
  const canSeeCost = me.role === 'owner';

  // Products are tenant-wide, not store-owned - a branch toggle here can't
  // filter the catalog itself, only annotate each row with that branch's
  // stock-on-hand (which genuinely is per-store).
  let branchStock: Record<number, number> | null = null;
  let branchName: string | null = null;
  if (store) {
    const { levels } = await payloadFetch<{ levels: StockLevel[] }>(`/api/reports/stock-levels?store=${store}`);
    branchStock = Object.fromEntries(levels.map((l) => [l.product, l.quantity]));
    branchName = stores.find((s) => String(s.id) === store)?.name ?? null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Products</h1>
        <div className="flex flex-wrap gap-2">
          <Suspense fallback={null}>
            <BranchFilter stores={stores} />
          </Suspense>
          <ImportProductsDialog stores={stores} />
          <ProductDialog />
        </div>
      </div>

      <ProductsTable products={products} canSeeCost={canSeeCost} branchStock={branchStock} branchName={branchName} />
    </div>
  );
}
