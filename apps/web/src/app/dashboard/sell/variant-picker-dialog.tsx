'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/empty-state';
import { useIsMobile } from '@/hooks/use-mobile';
import { fuzzySearch } from '@/lib/fuzzy-search';
import { stockKey } from '@/lib/stock-key';
import type { Product } from './page';

// Opens whenever a variant-having product is picked, from either the
// search grid or the "frequently bought with" suggestions - a product with
// variants is never sold as its bare self (see sell-client.tsx's
// requestAdd), so this is the one place a specific variant actually gets
// chosen, with its own resolved price and its own actual stock. A search
// box + capped scroll region matter here specifically because this list
// has no upper bound (a paint product can carry 40+ color/size variants).
export function VariantPickerDialog({
  product,
  stockByKey,
  onSelect,
  onOpenChange,
}: {
  product: Product | null;
  stockByKey: Map<string, number>;
  onSelect: (variantId: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');

  // Fresh search box every time a different product is opened - matches
  // product-search.tsx's own setQuery('') on selection.
  useEffect(() => {
    setQuery('');
  }, [product?.id]);

  const variants = product?.variants ?? [];
  const results = query.trim() ? fuzzySearch(variants, ['label', 'sku', 'barcode'], query) : variants;

  const body = (
    <div className="flex flex-col gap-3">
      {variants.length > 6 ? (
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search by name, SKU, or barcode..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      ) : null}
      <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
        {results.length === 0 ? (
          <EmptyState icon={Search} title={`No options match "${query.trim()}"`} description="Try a different name or SKU." />
        ) : (
          results.map((variant) => {
            if (!product) return null;
            const stock = stockByKey.get(stockKey(product.id, variant.id)) ?? 0;
            const price = variant.sellPrice ?? product.sellPrice;
            const outOfStock = stock <= 0;
            return (
              <button
                key={variant.id}
                type="button"
                disabled={outOfStock || !variant.id}
                onClick={() => variant.id && onSelect(variant.id)}
                className="flex min-h-11 items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{variant.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{variant.sku}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">{price.toFixed(2)}</p>
                  <p className={outOfStock ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                    {outOfStock ? 'Out of stock' : `${stock} in stock`}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={product != null} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{product?.name} — choose an option</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={product != null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product?.name} — choose an option</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
