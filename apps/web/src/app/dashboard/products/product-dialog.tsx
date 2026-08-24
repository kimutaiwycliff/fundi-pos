'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

type Product = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  category: string | null;
  costPrice?: number;
  sellPrice: number;
  taxRate: number;
  reorderPoint?: number;
};

// One dialog for both add and edit, same pattern as staff-dialog.tsx/
// store-dialog.tsx - the trigger button is built inside this component's
// own render rather than passed in as a prop, which is what actually
// fixed a real "Primitive.button failed to slot onto its children" error
// on the Staff page (a pre-built JSX element passed through props across
// a .map() apparently isn't a safe pattern for Radix's asChild Slot here).
export function ProductDialog({ product }: { product?: Product }) {
  const router = useRouter();
  const isEdit = Boolean(product);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    name: product?.name ?? '',
    category: product?.category ?? '',
    costPrice: product?.costPrice != null ? String(product.costPrice) : '',
    sellPrice: product ? String(product.sellPrice) : '',
    taxRate: product ? String(product.taxRate) : '0.16',
    reorderPoint: product?.reorderPoint != null ? String(product.reorderPoint) : '0',
  });

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch(isEdit ? `/api/payload/products/${product!.id}` : '/api/payload/products', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: form.sku,
        barcode: form.barcode || null,
        name: form.name,
        category: form.category,
        costPrice: Number(form.costPrice) || 0,
        sellPrice: Number(form.sellPrice) || 0,
        taxRate: Number(form.taxRate) || 0,
        reorderPoint: Number(form.reorderPoint) || 0,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.errors?.[0]?.message ?? `Failed to ${isEdit ? 'update' : 'create'} product`);
      setLoading(false);
      return;
    }

    setOpen(false);
    setLoading(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        ) : (
          <Button>New product</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit product' : 'New product'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" required value={form.sku} onChange={update('sku')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="barcode">Barcode</Label>
              <Input id="barcode" value={form.barcode} onChange={update('barcode')} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" required value={form.name} onChange={update('name')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Category</Label>
            <Input id="category" value={form.category} onChange={update('category')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="costPrice">Cost price</Label>
              <Input id="costPrice" type="number" step="0.01" value={form.costPrice} onChange={update('costPrice')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sellPrice">Sell price</Label>
              <Input id="sellPrice" type="number" step="0.01" value={form.sellPrice} onChange={update('sellPrice')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxRate">Tax rate</Label>
              <Input id="taxRate" type="number" step="0.01" value={form.taxRate} onChange={update('taxRate')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reorderPoint">Reorder point</Label>
              <Input id="reorderPoint" type="number" step="1" value={form.reorderPoint} onChange={update('reorderPoint')} />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
