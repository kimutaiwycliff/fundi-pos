'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/empty-state';
import type { Product } from './page';

// Barcode scanners are plain USB/Bluetooth-HID keyboard input - they type
// into whatever has focus and end with Enter, so an autofocused input that
// adds the first result on Enter already handles scans with no special-case
// code, same as apps/desktop/src/Till.tsx's search box.
export function ProductSearch({
  products,
  stockByProduct,
  onSelect,
}: {
  products: Product[];
  stockByProduct: Map<number, number>;
  onSelect: (product: Product) => void;
}) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();

  const results = trimmed
    ? products
        .filter(
          (p) =>
            (p.barcode && p.barcode.toLowerCase() === trimmed) ||
            p.name.toLowerCase().includes(trimmed) ||
            p.sku.toLowerCase().includes(trimmed),
        )
        .slice(0, 24)
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
            const stock = stockByProduct.get(product.id) ?? 0;
            const outOfStock = stock <= 0;
            return (
              <button
                key={product.id}
                type="button"
                disabled={outOfStock}
                onClick={() => handleSelect(product)}
                className="flex min-h-11 flex-col gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="truncate text-sm font-medium">{product.name}</span>
                <span className="truncate text-xs text-muted-foreground">{product.sku}</span>
                <span className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{product.sellPrice.toFixed(2)}</span>
                  <span className={outOfStock ? 'text-destructive' : 'text-muted-foreground'}>
                    {outOfStock ? 'Out of stock' : `${stock} in stock`}
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
