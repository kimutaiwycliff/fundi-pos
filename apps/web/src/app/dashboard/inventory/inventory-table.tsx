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
import { stockKey } from '@/lib/stock-key';
import { fuzzySearch } from '@/lib/fuzzy-search';

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
type Store = { id: number; name: string };

// Same fuzzy-search-over-an-already-loaded-list pattern as products-table.tsx
// and every other search bar in this app - stock levels are already fetched
// whole for this page (never more than a few hundred rows), so there's
// nothing to query server-side.
export function InventoryTable({ levels, stores }: { levels: StockLevel[]; stores: Store[] }) {
  const [query, setQuery] = useState('');
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  const filtered = useMemo(
    () => fuzzySearch(levels, ['productName', 'variantLabel'], query),
    [levels, query],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full max-w-sm">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by product or variant..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
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
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {levels.length === 0 ? 'No stock movements yet.' : 'No products match your search.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((level) => (
                <TableRow key={`${level.store}-${stockKey(level.product, level.variant)}`}>
                  <TableCell>
                    {level.productName}
                    {level.variantLabel ? (
                      <span className="text-muted-foreground"> · {level.variantLabel}</span>
                    ) : null}
                  </TableCell>
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
      {query && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {levels.length} rows
        </p>
      )}
    </div>
  );
}
