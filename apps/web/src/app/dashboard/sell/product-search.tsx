'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/empty-state';
import { fuzzySearch } from '@/lib/fuzzy-search';
import { stockKey } from '@/lib/stock-key';
import type { Product } from './page';

// Barcode scanners are plain USB/Bluetooth-HID keyboard input - they type
// into whatever has focus and end with Enter, so an autofocused input that
// adds the first result on Enter already handles scans with no special-case
// code, same as apps/desktop/src/Till.tsx's search box.
//
// A tile only ever reports "this product was picked" - it never decides
// whether that means adding straight to cart or opening a variant picker
// first (that's sell-client.tsx's requestAdd, shared by this search grid
// and the "frequently bought with" suggestion strip), so the stock/price
// shown here for a variant-having product is a summary (total across all
// variants, cheapest price) rather than one exact figure.
export function ProductSearch({
  products,
  stockByKey,
  mediaUrlById,
  onSelect,
}: {
  products: Product[];
  stockByKey: Map<string, number>;
  mediaUrlById: Record<number, string>;
  onSelect: (product: Product) => void;
}) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();

  // A barcode is scanner input - exact digits, typed fast, ending in Enter
  // with no chance for a human to double-check before it fires. Fuzzy-
  // matching that could ring up the wrong product (a close-but-wrong
  // barcode scoring as a "match"), so an exact hit always short-circuits
  // straight past the fuzzy pass below. Free-text (name/SKU) typos are the
  // actual pain point fuzzy search is for, and carry no such risk.
  const exactBarcodeMatch = trimmed
    ? products.find(
        (p) =>
          (p.barcode && p.barcode.toLowerCase() === trimmed) ||
          p.variants.some((v) => v.barcode && v.barcode.toLowerCase() === trimmed),
      )
    : undefined;

  const results = exactBarcodeMatch
    ? [exactBarcodeMatch]
    : trimmed
      ? fuzzySearch(products, ['name', 'sku', 'variants.sku', 'variants.label'], query).slice(0, 24)
      : [];

  function handleSelect(product: Product) {
    onSelect(product);
    setQuery('');
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="Scan barcode or search by name/SKU..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results.length > 0) handleSelect(results[0]);
          }}
          className="pl-8"
        />
      </div>
      {results.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((product) => {
            const hasVariants = product.variants.length > 0;
            const stock = hasVariants
              ? product.variants.reduce((sum, v) => sum + (stockByKey.get(stockKey(product.id, v.id)) ?? 0), 0)
              : (stockByKey.get(stockKey(product.id, null)) ?? 0);
            const outOfStock = stock <= 0;
            const priceLabel = hasVariants
              ? `from ${Math.min(...product.variants.map((v) => v.sellPrice ?? product.sellPrice)).toFixed(2)}`
              : product.sellPrice.toFixed(2);
            const imageUrl = product.image != null ? mediaUrlById[product.image] : undefined;
            return (
              <button
                key={product.id}
                type="button"
                disabled={outOfStock}
                onClick={() => handleSelect(product)}
                className="flex min-h-11 gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="size-10 shrink-0 rounded-md border object-cover" />
                ) : null}
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                    <span className="truncate">{product.name}</span>
                    {hasVariants ? (
                      <Badge variant="outline" className="shrink-0">
                        {product.variants.length}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{product.sku}</span>
                  <span className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{priceLabel}</span>
                    <span className={outOfStock ? 'text-destructive' : 'text-muted-foreground'}>
                      {outOfStock ? 'Out of stock' : `${stock} in stock`}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : trimmed ? (
        <EmptyState
          icon={Search}
          title={`No products match "${query.trim()}"`}
          description="Try a different name, SKU, or scan the barcode directly."
        />
      ) : null}
    </div>
  );
}
