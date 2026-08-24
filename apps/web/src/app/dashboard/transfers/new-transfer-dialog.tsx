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

interface Store {
  id: number;
  name: string;
}
interface Product {
  id: number;
  name: string;
  sku: string;
}

export function NewTransferDialog({ stores, products }: { stores: Store[]; products: Product[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromStore, setFromStore] = useState('');
  const [toStore, setToStore] = useState('');
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('1');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch('/api/payload/stock-transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromStore: Number(fromStore),
        toStore: Number(toStore),
        lineItems: [{ product: Number(product), quantity: Number(quantity) || 1 }],
        status: 'draft',
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = body?.errors?.[0]?.message ?? 'Failed to create transfer';
      setError(message);
      toast.error(message);
      setLoading(false);
      return;
    }

    setOpen(false);
    setLoading(false);
    toast.success('Transfer created');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New transfer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New stock transfer</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>From store</Label>
              <Select value={fromStore} onValueChange={setFromStore} required>
                <SelectTrigger><SelectValue placeholder="Select store" /></SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>To store</Label>
              <Select value={toStore} onValueChange={setToStore} required>
                <SelectTrigger><SelectValue placeholder="Select store" /></SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Product</Label>
            <ProductCombobox products={products} value={product} onValueChange={setProduct} placeholder="Select product" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantity">Quantity</Label>
            <Input id="quantity" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={loading || !fromStore || !toStore || !product}>
              {loading ? 'Creating...' : 'Create transfer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
