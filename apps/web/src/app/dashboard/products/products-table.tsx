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
import { fuzzySearch } from '@/lib/fuzzy-search';
import type { Product, StockLevel } from './page';

type Store = { id: number; name: string };

export function ProductsTable({
  products,
  canSeeCost,
  canEditFields,
  branchStock = null,
  branchName = null,
  stores,
  stockLevels,
  archivedView = false,
  mediaUrlById,
}: {
  products: Product[];
  canSeeCost: boolean;
  canEditFields: boolean;
  branchStock?: Record<number, number> | null;
  branchName?: string | null;
  stores: Store[];
  stockLevels: StockLevel[];
  archivedView?: boolean;
  mediaUrlById: Record<number, string>;
}) {
  const [query, setQuery] = useState('');
  // Lifted out of ProductDialog so a row click can open that row's own
  // editor, not just its Edit button - most useful on a phone-width
  // browser where the button sits off to the right.
  const [openProductId, setOpenProductId] = useState<number | null>(null);

  const filtered = useMemo(
    () => fuzzySearch(products, ['name', 'sku', 'barcode', 'category'], query),
    [products, query],
  );

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

      <div className="hidden rounded-md border md:block">
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
              filtered.map((product) => {
                const imageUrl = product.image != null ? mediaUrlById[product.image] : undefined;
                return (
                <TableRow
                  key={product.id}
                  onClick={() => setOpenProductId(product.id)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt="" className="size-8 shrink-0 rounded-md border object-cover" />
                      ) : (
                        <div className="size-8 shrink-0 rounded-md border border-dashed bg-muted/30" />
                      )}
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
                    {product.maxDiscountAmount ? product.maxDiscountAmount.toFixed(2) : '—'}
                  </TableCell>
                  {branchStock ? (
                    <TableCell className="text-right">{branchStock[product.id] ?? 0}</TableCell>
                  ) : null}
                  {/* stopPropagation so the Edit trigger button inside
                      ProductDialog doesn't also fire the row's own
                      onClick above (redundant, not harmful, but avoids
                      any double-toggle weirdness). */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <ProductDialog
                      product={product}
                      stores={stores}
                      allProducts={products}
                      stockLevels={stockLevels}
                      canSeeCost={canSeeCost}
                      canEditFields={canEditFields}
                      mediaUrlById={mediaUrlById}
                      open={openProductId === product.id}
                      onOpenChange={(o) => setOpenProductId(o ? product.id : null)}
                    />
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Compact card list for narrow/tablet screens - the table above is
          hard to scan below md, so this surfaces the same data/actions
          (tap the card or its Edit button to open the same controlled
          ProductDialog) with name/price given the most visual weight. */}
      <div className="flex flex-col gap-2 md:hidden">
        {filtered.length === 0 ? (
          <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">
            {products.length === 0
              ? archivedView
                ? 'No archived products.'
                : 'No products yet.'
              : 'No products match your search.'}
          </p>
        ) : (
          filtered.map((product) => {
            const imageUrl = product.image != null ? mediaUrlById[product.image] : undefined;
            const margin = canSeeCost ? product.sellPrice - (product.costPrice ?? 0) : null;
            return (
              <div
                key={product.id}
                onClick={() => setOpenProductId(product.id)}
                className="flex items-center gap-3 rounded-lg border p-3 active:bg-muted/50"
              >
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="size-12 shrink-0 rounded-md border object-cover" />
                ) : (
                  <div className="size-12 shrink-0 rounded-md border border-dashed bg-muted/30" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    {product.variants.length > 0 ? (
                      <Badge variant="outline" className="shrink-0">
                        {product.variants.length} variant{product.variants.length === 1 ? '' : 's'}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {product.sku}
                    {product.category ? ` · ${product.category}` : ''}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {canSeeCost ? <span>Cost {(product.costPrice ?? 0).toFixed(2)}</span> : null}
                    {canSeeCost ? <span>Margin {margin!.toFixed(2)}</span> : null}
                    {branchStock ? (
                      <span>
                        Stock at {branchName ?? 'branch'}: {branchStock[product.id] ?? 0}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <span className="text-base font-semibold">{product.sellPrice.toFixed(2)}</span>
                  <ProductDialog
                    product={product}
                    stores={stores}
                    allProducts={products}
                    stockLevels={stockLevels}
                    canSeeCost={canSeeCost}
                    canEditFields={canEditFields}
                    mediaUrlById={mediaUrlById}
                    open={openProductId === product.id}
                    onOpenChange={(o) => setOpenProductId(o ? product.id : null)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
      {query && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {products.length} products
        </p>
      )}
    </div>
  );
}
