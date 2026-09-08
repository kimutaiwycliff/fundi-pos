'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProductCombobox } from '@/components/product-combobox';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';

type Variant = { id?: string; label: string; sku: string; barcode?: string | null };
type Product = { id: number; name: string; sku: string; variants: Variant[] };
type Store = { id: number; name: string };

const NO_VARIANT = '__base__';

const TYPES = [
  { value: 'restock', label: 'Restock (received new stock)' },
  { value: 'adjustment', label: 'Correction (recount - can be + or -)' },
  { value: 'write_off', label: 'Write-off (damaged / lost / expired)' },
] as const;

// Every stock change is a new StockMovements row, never a direct edit to a
// stored count (there is no stored count) - same append-only ledger every
// sale/transfer already goes through. This is the manual-entry path for
// the two cases nothing else creates automatically: receiving stock
// outside a purchase order, and correcting/writing off a physical count.
export function StockAdjustmentDialog({ products, stores }: { products: Product[]; stores: Store[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    productId: '',
    variantId: NO_VARIANT,
    storeId: stores[0] ? String(stores[0].id) : '',
    type: 'restock' as (typeof TYPES)[number]['value'],
    quantity: '',
  });

  const selectedProduct = products.find((p) => String(p.id) === form.productId);
  const savedVariants = (selectedProduct?.variants ?? []).filter((v): v is Variant & { id: string } => Boolean(v.id));

  function handleProductChange(productId: string) {
    const product = products.find((p) => String(p.id) === productId);
    const firstVariant = product?.variants.find((v) => v.id)?.id;
    setForm((f) => ({ ...f, productId, variantId: firstVariant ?? NO_VARIANT }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const qty = Number(form.quantity);
    if (!form.productId || !form.storeId || !Number.isFinite(qty) || qty === 0) {
      const message = 'Pick a product, store, and a non-zero quantity';
      setError(message);
      toast.error(message);
      return;
    }
    // Restock/write-off have an implied sign - a manager typing "10" for a
    // write-off means "10 units gone", not "add 10". Adjustment is the only
    // type where the sign is taken literally, since a recount can go either way.
    const quantityDelta = form.type === 'write_off' ? -Math.abs(qty) : form.type === 'restock' ? Math.abs(qty) : qty;

    setLoading(true);
    try {
      const response = await clientFetch('/api/payload/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          product: Number(form.productId),
          variant: form.variantId === NO_VARIANT ? null : form.variantId,
          store: Number(form.storeId),
          quantityDelta,
          reason: form.type,
          clientTimestamp: new Date().toISOString(),
          sourceTerminal: 'dashboard',
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = errorMessageFrom(body, 'Failed to record the stock movement');
        setError(message);
        toast.error(message);
        return;
      }

      setOpen(false);
      setForm((f) => ({ ...f, productId: '', variantId: NO_VARIANT, quantity: '' }));
      toast.success('Stock movement recorded');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Adjust stock</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product">Product</Label>
            <ProductCombobox
              products={products}
              value={form.productId}
              onValueChange={handleProductChange}
              placeholder="Choose a product"
            />
          </div>
          {savedVariants.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="variant">Variant</Label>
              <Select value={form.variantId} onValueChange={(v) => setForm((f) => ({ ...f, variantId: v }))}>
                <SelectTrigger id="variant" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VARIANT}>Base product (no variant)</SelectItem>
                  {savedVariants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="store">Store</Label>
            <Select value={form.storeId} onValueChange={(v) => setForm((f) => ({ ...f, storeId: v }))}>
              <SelectTrigger id="store">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as typeof f.type }))}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantity">
              Quantity {form.type === 'adjustment' ? '(use a minus sign to remove stock)' : ''}
            </Label>
            <Input
              id="quantity"
              type="number"
              step="0.001"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Record movement'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
