import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { payloadFetch } from '@/lib/payload-client';
import { BranchFilter } from '@/components/branch-filter';
import { StockAdjustmentDialog } from './stock-adjustment-dialog';

interface StockLevel {
  store: number;
  product: number;
  productName: string;
  quantity: number;
  reorderPoint: number;
  lowStock: boolean;
}
type Product = { id: number; name: string; sku: string };
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
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const sorted = [...levels].sort((a, b) => Number(b.lowStock) - Number(a.lowStock));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Inventory levels</h1>
          <p className="text-sm text-muted-foreground">
            Current stock is always a derived sum over the StockMovements ledger - never a stored count.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <BranchFilter stores={stores} />
          </Suspense>
          <StockAdjustmentDialog products={products} stores={stores} />
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Store</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Reorder point</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No stock movements yet.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((level) => (
                <TableRow key={`${level.store}-${level.product}`}>
                  <TableCell>{level.productName}</TableCell>
                  <TableCell>{storeName.get(level.store) ?? `#${level.store}`}</TableCell>
                  <TableCell className="text-right">{level.quantity}</TableCell>
                  <TableCell className="text-right">{level.reorderPoint}</TableCell>
                  <TableCell>
                    {level.lowStock ? (
                      <Badge variant="destructive">Low stock</Badge>
                    ) : (
                      <Badge variant="secondary">OK</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
