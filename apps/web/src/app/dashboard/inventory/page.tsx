import { Suspense } from 'react';
import { payloadFetch } from '@/lib/payload-client';
import { BranchFilter } from '@/components/branch-filter';
import { StockAdjustmentDialog } from './stock-adjustment-dialog';
import { InventoryTable } from './inventory-table';

interface StockLevel {
  store: number;
  product: number;
  variant: string | null;
  variantLabel: string | null;
  productName: string;
  quantity: number;
  reorderPoint: number;
  lowStock: boolean;
}
type Variant = { id?: string; label: string; sku: string; barcode?: string | null };
type Product = { id: number; name: string; sku: string; variants: Variant[] };
type Store = { id: number; name: string };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { store } = await searchParams;
  const [{ levels }, { docs: products }, { docs: stores }] = await Promise.all([
    payloadFetch<{ levels: StockLevel[] }>(`/api/reports/stock-levels${store ? `?store=${store}` : ''}`),
    payloadFetch<{ docs: Product[] }>('/api/products?sort=name&limit=200'),
    payloadFetch<{ docs: Store[] }>('/api/stores?sort=name&limit=100'),
  ]);
  const sorted = [...levels].sort((a, b) => Number(b.lowStock) - Number(a.lowStock));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Inventory levels</h1>
          <p className="text-sm text-muted-foreground">
            Current stock is always a derived sum over the StockMovements ledger - never a stored count. A product
            with variants shows one row per variant, since they&apos;re tracked separately.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <BranchFilter stores={stores} />
          </Suspense>
          <StockAdjustmentDialog products={products} stores={stores} />
        </div>
      </div>
      <InventoryTable levels={sorted} stores={stores} />
    </div>
  );
}
