'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Product } from './page';

type Store = { id: number; name: string };
interface StockLevel {
  store: number;
  product: number;
  quantity: number;
}
type Variant = { id?: string; label: string; sku: string; barcode?: string | null };

// Uppercase, hyphenated slug of the name - a reasonable default SKU so
// adding a product doesn't require typing one by hand. Only ever runs
// while creating (never edit) and stops the moment the user types into
// the SKU field themselves (skuTouched, below).
function deriveSku(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const STOCK_TYPES = [
  { value: 'restock', label: 'Restock (received new stock)' },
  { value: 'adjustment', label: 'Correction (recount - can be + or -)' },
  { value: 'write_off', label: 'Write-off (damaged / lost / expired)' },
] as const;

// Multi-select "related products" picker - same Command+Popover shell as
// ProductCombobox, but selecting an item toggles it into a list instead of
// replacing a single value, and the popover stays open so a manager can
// pick several in one go.
function RelatedProductsField({
  allProducts,
  excludeId,
  value,
  onChange,
}: {
  allProducts: Product[];
  excludeId?: number;
  value: number[];
  onChange: (next: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = allProducts.filter((p) => p.id !== excludeId);
  const selected = options.filter((p) => value.includes(p.id));

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            <span className="truncate text-muted-foreground">
              {selected.length > 0 ? `${selected.length} selected` : 'Search products to link…'}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Search by name or SKU..." />
            <CommandList>
              <CommandEmpty>No product found.</CommandEmpty>
              <CommandGroup>
                {options.map((p) => (
                  <CommandItem key={p.id} value={`${p.name} ${p.sku}`} onSelect={() => toggle(p.id)}>
                    <Check className={cn('mr-2 size-4', value.includes(p.id) ? 'opacity-100' : 'opacity-0')} />
                    {p.name} <span className="ml-1 text-muted-foreground">({p.sku})</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <Badge key={p.id} variant="secondary" className="gap-1 pr-1">
              {p.name}
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                aria-label={`Remove ${p.name}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// One dialog for both add and edit, same pattern as staff-dialog.tsx/
// store-dialog.tsx - the trigger button is built inside this component's
// own render rather than passed in as a prop, which is what actually
// fixed a real "Primitive.button failed to slot onto its children" error
// on the Staff page (a pre-built JSX element passed through props across
// a .map() apparently isn't a safe pattern for Radix's asChild Slot here).
export function ProductDialog({
  product,
  stores,
  allProducts,
  stockLevels,
}: {
  product?: Product;
  stores: Store[];
  allProducts: Product[];
  stockLevels: StockLevel[];
}) {
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
    maxDiscountPercent: product?.maxDiscountPercent != null ? String(product.maxDiscountPercent) : '0',
  });
  const [variants, setVariants] = useState<Variant[]>(product?.variants ?? []);
  const [relatedProducts, setRelatedProducts] = useState<number[]>(product?.relatedProducts ?? []);

  const [stockForm, setStockForm] = useState({
    storeId: stores[0] ? String(stores[0].id) : '',
    type: 'restock' as (typeof STOCK_TYPES)[number]['value'],
    quantity: '',
  });
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  // Edit mode starts "touched" so an existing SKU is never silently
  // overwritten by a later name edit.
  const [skuTouched, setSkuTouched] = useState(isEdit);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value;
    setForm((f) => (skuTouched ? { ...f, name } : { ...f, name, sku: deriveSku(name) }));
  }

  function handleSkuChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSkuTouched(true);
    setForm((f) => ({ ...f, sku: e.target.value }));
  }

  function updateVariant(index: number, field: keyof Variant) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: e.target.value } : v)));
  }

  function addVariant() {
    setVariants((prev) => [...prev, { label: '', sku: '', barcode: '' }]);
  }

  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index));
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
        maxDiscountPercent: Number(form.maxDiscountPercent) || 0,
        variants: variants.filter((v) => v.label.trim() && v.sku.trim()),
        relatedProducts,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = body?.errors?.[0]?.message ?? `Failed to ${isEdit ? 'update' : 'create'} product`;
      setError(message);
      toast.error(message);
      setLoading(false);
      return;
    }

    setOpen(false);
    setLoading(false);
    toast.success(isEdit ? 'Product updated' : 'Product created');
    router.refresh();
  }

  async function handleArchiveToggle() {
    if (!product) return;
    setArchiveLoading(true);
    const nextActive = !product.isActive;
    const response = await fetch(`/api/payload/products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: nextActive }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      toast.error(body?.errors?.[0]?.message ?? 'Failed to update product');
      setArchiveLoading(false);
      return;
    }
    toast.success(nextActive ? 'Product restored' : 'Product archived');
    setArchiveLoading(false);
    setOpen(false);
    router.refresh();
  }

  async function handleStockAdjust() {
    if (!product) return;
    const qty = Number(stockForm.quantity);
    if (!stockForm.storeId || !Number.isFinite(qty) || qty === 0) {
      const message = 'Pick a store and a non-zero quantity';
      setStockError(message);
      toast.error(message);
      return;
    }
    const quantityDelta =
      stockForm.type === 'write_off' ? -Math.abs(qty) : stockForm.type === 'restock' ? Math.abs(qty) : qty;

    setStockLoading(true);
    setStockError(null);
    const response = await fetch('/api/payload/stock-movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        product: product.id,
        store: Number(stockForm.storeId),
        quantityDelta,
        reason: stockForm.type,
        clientTimestamp: new Date().toISOString(),
        sourceTerminal: 'dashboard',
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = body?.errors?.[0]?.message ?? 'Failed to record the stock movement';
      setStockError(message);
      toast.error(message);
      setStockLoading(false);
      return;
    }

    setStockLoading(false);
    setStockForm((f) => ({ ...f, quantity: '' }));
    toast.success('Stock movement recorded');
    router.refresh();
  }

  const productStock = product ? stockLevels.filter((l) => l.product === product.id) : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="lg">
            Edit
          </Button>
        ) : (
          <Button>New product</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? 'Edit product' : 'New product'}
            {isEdit && !product!.isActive ? <Badge variant="destructive">Archived</Badge> : null}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" required value={form.name} onChange={handleNameChange} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sku">
                SKU
                {!isEdit && !skuTouched ? (
                  <span className="ml-1 font-normal text-muted-foreground">(auto)</span>
                ) : null}
              </Label>
              <Input id="sku" required value={form.sku} onChange={handleSkuChange} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="barcode">Barcode</Label>
              <Input id="barcode" value={form.barcode} onChange={update('barcode')} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Category</Label>
            <Input id="category" value={form.category} onChange={update('category')} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="costPrice">Cost price</Label>
              <Input id="costPrice" type="number" step="0.01" value={form.costPrice} onChange={update('costPrice')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sellPrice">Sell price</Label>
              <Input id="sellPrice" type="number" step="0.01" value={form.sellPrice} onChange={update('sellPrice')} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxRate">Tax rate</Label>
              <Input id="taxRate" type="number" step="0.01" value={form.taxRate} onChange={update('taxRate')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reorderPoint">Reorder point</Label>
              <Input id="reorderPoint" type="number" step="1" value={form.reorderPoint} onChange={update('reorderPoint')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maxDiscountPercent">Max discount %</Label>
              <Input
                id="maxDiscountPercent"
                type="number"
                step="1"
                min="0"
                max="100"
                value={form.maxDiscountPercent}
                onChange={update('maxDiscountPercent')}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Variants</Label>
              <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                Add variant
              </Button>
            </div>
            {variants.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No variants - this product is sold as-is. Add one for options like size or color (e.g. &quot;Red /
                L&quot;).
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {variants.map((variant, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                    <div className="flex flex-col gap-1">
                      {index === 0 ? <Label className="text-xs text-muted-foreground">Label</Label> : null}
                      <Input
                        placeholder="e.g. Red / L"
                        value={variant.label}
                        onChange={updateVariant(index, 'label')}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      {index === 0 ? <Label className="text-xs text-muted-foreground">SKU</Label> : null}
                      <Input value={variant.sku} onChange={updateVariant(index, 'sku')} />
                    </div>
                    <div className="flex flex-col gap-1">
                      {index === 0 ? <Label className="text-xs text-muted-foreground">Barcode</Label> : null}
                      <Input value={variant.barcode ?? ''} onChange={updateVariant(index, 'barcode')} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeVariant(index)} aria-label="Remove variant">
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t pt-4">
            <Label>Related products</Label>
            <p className="text-xs text-muted-foreground">
              Suggested as add-ons on the Sell page once this product is in the cart.
            </p>
            <RelatedProductsField
              allProducts={allProducts}
              excludeId={product?.id}
              value={relatedProducts}
              onChange={setRelatedProducts}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            {isEdit ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant={product!.isActive ? 'destructive' : 'outline'} disabled={archiveLoading}>
                    {product!.isActive ? 'Archive product' : 'Restore product'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {product!.isActive ? `Archive ${product!.name}?` : `Restore ${product!.name}?`}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {product!.isActive
                        ? 'Hidden from the Sell page and the default Products list. Past orders, stock movements, and reports are unaffected, and you can restore it any time.'
                        : 'Visible again on the Sell page and the default Products list.'}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant={product!.isActive ? 'destructive' : 'default'}
                      onClick={handleArchiveToggle}
                    >
                      {product!.isActive ? 'Archive' : 'Restore'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <div />
            )}
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
            </Button>
          </DialogFooter>
        </form>

        {isEdit ? (
          <div className="flex flex-col gap-2 border-t pt-4">
            <Label>Stock on hand</Label>
            {productStock.length === 0 ? (
              <p className="text-xs text-muted-foreground">No stock movements recorded yet.</p>
            ) : (
              <div className="flex flex-col gap-1 text-sm">
                {productStock.map((level) => (
                  <div key={level.store} className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {stores.find((s) => s.id === level.store)?.name ?? `Store #${level.store}`}
                    </span>
                    <span className="font-medium tabular-nums">{level.quantity}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-1 grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
              <div className="flex min-w-0 flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Store</Label>
                <Select value={stockForm.storeId} onValueChange={(v) => setStockForm((f) => ({ ...f, storeId: v }))}>
                  <SelectTrigger className="w-full">
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
              <div className="flex min-w-0 flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select
                  value={stockForm.type}
                  onValueChange={(v) => setStockForm((f) => ({ ...f, type: v as typeof f.type }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STOCK_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Qty</Label>
                <Input
                  type="number"
                  step="0.001"
                  className="w-24"
                  value={stockForm.quantity}
                  onChange={(e) => setStockForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <Button type="button" onClick={handleStockAdjust} disabled={stockLoading}>
                {stockLoading ? 'Saving…' : 'Record'}
              </Button>
            </div>
            {stockError ? <p className="text-sm text-destructive">{stockError}</p> : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
