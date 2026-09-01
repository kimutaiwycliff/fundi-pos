'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { stockKey } from '@/lib/stock-key';
import type { Product } from './page';

// Opens whenever a variant-having product is picked, from either the
// search grid or the "frequently bought with" suggestions - a product with
// variants is never sold as its bare self (see sell-client.tsx's
// requestAdd), so this is the one place a specific variant actually gets
// chosen, with its own resolved price and its own actual stock.
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
  return (
    <Dialog open={product != null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product?.name} — choose an option</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {product?.variants.map((variant) => {
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
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
