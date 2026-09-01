'use client';

import { Minus, Plus, ShoppingCart, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/empty-state';
import type { OrderTotals } from '@hardware-pos/business-logic';
import { stockKey } from '@/lib/stock-key';
import { lineDisplayLabel, lineUnitPrice, type CartLine } from './types';

function maxDiscountAmountForLine(quantity: number, product: CartLine['product']): number {
  return quantity * product.maxDiscountAmount;
}

export function CartPanel({
  cart,
  totals,
  onUpdateQuantity,
  onUpdateDiscount,
}: {
  cart: CartLine[];
  totals: OrderTotals;
  onUpdateQuantity: (productId: number, variantId: string | null, quantity: number) => void;
  onUpdateDiscount: (productId: number, variantId: string | null, value: number) => void;
}) {
  if (cart.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Cart is empty"
        description="Search or scan a product to get started."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {cart.map((line) => {
          const max = maxDiscountAmountForLine(line.quantity, line.product);
          const unitPrice = lineUnitPrice(line.product, line.variantId);
          const lineTotal = line.quantity * unitPrice - line.discountAmount;
          return (
            <div key={stockKey(line.product.id, line.variantId)} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{lineDisplayLabel(line.product, line.variantId)}</p>
                  <p className="text-xs text-muted-foreground">{unitPrice.toFixed(2)} each</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9"
                    onClick={() => onUpdateQuantity(line.product.id, line.variantId, line.quantity - 1)}
                    aria-label="Decrease quantity"
                  >
                    <Minus />
                  </Button>
                  <span className="w-6 text-center text-sm font-medium">{line.quantity}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9"
                    onClick={() => onUpdateQuantity(line.product.id, line.variantId, line.quantity + 1)}
                    aria-label="Increase quantity"
                  >
                    <Plus />
                  </Button>
                </div>
                <span className="w-16 shrink-0 text-right text-sm font-semibold">{lineTotal.toFixed(2)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground"
                  onClick={() => onUpdateQuantity(line.product.id, line.variantId, 0)}
                  aria-label="Remove item"
                >
                  <X />
                </Button>
              </div>
              {line.product.maxDiscountAmount > 0 ? (
                <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  Discount
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={max}
                    step={0.01}
                    placeholder="0.00"
                    value={line.discountAmount === 0 ? '' : line.discountAmount}
                    onChange={(e) => onUpdateDiscount(line.product.id, line.variantId, Number(e.target.value) || 0)}
                    className="h-7 w-24"
                  />
                  <span>(max {max.toFixed(2)})</span>
                </label>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1 border-t pt-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Tax</span>
          <span>{totals.taxTotal.toFixed(2)}</span>
        </div>
        {totals.discountTotal > 0 ? (
          <div className="flex justify-between text-muted-foreground">
            <span>Discount</span>
            <span>-{totals.discountTotal.toFixed(2)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span>{totals.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
