'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProductDialog } from './product-dialog';
import type { Product } from './page';

type Store = { id: number; name: string };
interface StockLevel {
  store: number;
  product: number;
  quantity: number;
}

export function ProductsTable({
  products,
  canSeeCost,
  branchStock = null,
  branchName = null,
  stores,
  stockLevels,
  archivedView = false,
}: {
  products: Product[];
  canSeeCost: boolean;
  branchStock?: Record<number, number> | null;
  branchName?: string | null;
  stores: Store[];
  stockLevels: StockLevel[];
  archivedView?: boolean;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q),
    );
  }, [products, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full max-w-sm">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, SKU, barcode, or category..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              {canSeeCost ? <TableHead className="text-right">Cost</TableHead> : null}
              <TableHead className="text-right">Sell</TableHead>
              {canSeeCost ? <TableHead className="text-right">Margin</TableHead> : null}
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Max discount</TableHead>
              {branchStock ? <TableHead className="text-right">Stock at {branchName ?? 'branch'}</TableHead> : null}
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={(canSeeCost ? 9 : 7) + (branchStock ? 1 : 0)}
                  className="text-center text-muted-foreground"
                >
                  {products.length === 0
                    ? archivedView
                      ? 'No archived products.'
                      : 'No products yet.'
                    : 'No products match your search.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {product.name}
                      {product.variants.length > 0 ? (
                        <Badge variant="outline">
                          {product.variants.length} variant{product.variants.length === 1 ? '' : 's'}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {product.category ? <Badge variant="secondary">{product.category}</Badge> : '—'}
                  </TableCell>
                  {canSeeCost ? (
                    <TableCell className="text-right">{(product.costPrice ?? 0).toFixed(2)}</TableCell>
                  ) : null}
                  <TableCell className="text-right">{product.sellPrice.toFixed(2)}</TableCell>
                  {canSeeCost ? (
                    <TableCell className="text-right">
                      {(product.sellPrice - (product.costPrice ?? 0)).toFixed(2)}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">{(product.taxRate * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right">
                    {product.maxDiscountPercent ? `${product.maxDiscountPercent}%` : '—'}
                  </TableCell>
                  {branchStock ? (
                    <TableCell className="text-right">{branchStock[product.id] ?? 0}</TableCell>
                  ) : null}
                  <TableCell>
                    <ProductDialog product={product} stores={stores} allProducts={products} stockLevels={stockLevels} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {query && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {products.length} products
        </p>
      )}
    </div>
  );
}
