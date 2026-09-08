'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, ChevronsUpDown, ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';
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
import { stockKey } from '@/lib/stock-key';
import type { Product, StockLevel, Variant } from './page';

type Store = { id: number; name: string };

const STOCK_TYPES = [
  { value: 'restock', label: 'Restock (received new stock)' },
  { value: 'adjustment', label: 'Correction (recount - can be + or -)' },
  { value: 'write_off', label: 'Write-off (damaged / lost / expired)' },
] as const;

const NO_VARIANT = '__base__';

// Multi-select "related products" picker - same Command+Popover shell as
// ProductCombobox, but selecting an item toggles it into a list instead of
// replacing a single value, and the popover stays open so a manager can
// pick several in one go.
function RelatedProductsField({
  allProducts,
  excludeId,
  value,
  onChange,
  disabled,
}: {
  allProducts: Product[];
  excludeId?: number;
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
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
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between font-normal">
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

// Uploads straight to R2 via /api/media (its own dedicated route, not the
// generic JSON proxy - see that route's own comment) the moment a file is
// picked, then reports back the new media doc's id/url. Shared between the
// product-level image and each variant's own optional override below.
function ImageField({
  label,
  imageUrl,
  onChange,
}: {
  label: string;
  imageUrl: string | null;
  onChange: (imageId: number | null, imageUrl: string | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await clientFetch('/api/media', { method: 'POST', body: formData });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(errorMessageFrom(body, 'Failed to upload image'));
        return;
      }
      onChange(body.doc.id, body.doc.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-3">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="size-12 shrink-0 rounded-md border object-cover" />
      ) : (
        <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground">
          <ImageIcon className="size-4" />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-2">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => inputRef.current?.click()}>
            {loading ? 'Uploading…' : imageUrl ? 'Replace' : 'Upload'}
          </Button>
          {imageUrl ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null, null)}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// One dialog for both add and edit, same pattern as staff-dialog.tsx/
// store-dialog.tsx - the trigger button is built inside this component's
// own render rather than passed in as a prop, which is what actually
// fixed a real "Primitive.button failed to slot onto its children" error
// on the Staff page (a pre-built JSX element passed through props across
// a .map() apparently isn't a safe pattern for Radix's asChild Slot here).
// The dialog's own working copy of a variant carries an ephemeral imageUrl
// alongside the real `image` id field, purely so an already-uploaded image
// (existing variant) or a freshly-uploaded one (new variant) can render a
// preview without a fresh lookup - stripped back out before the array is
// sent to the API (see handleSubmit).
type WorkingVariant = Variant & { imageUrl?: string | null };

export function ProductDialog({
  product,
  stores,
  allProducts,
  stockLevels,
  canSeeCost,
  canEditFields,
  mediaUrlById,
}: {
  product?: Product;
  stores: Store[];
  allProducts: Product[];
  stockLevels: StockLevel[];
  canSeeCost: boolean;
  // Owner/manager only - a cashier can still open this dialog and change
  // the product's own photo (ImageField below is never gated by this),
  // but every other field is disabled client-side so the form is honest
  // about what a cashier's save will actually change - the same fields
  // are independently locked server-side (Products.ts's own field-level
  // access), this is purely about not showing an editable-looking input
  // that silently no-ops.
  canEditFields: boolean;
  mediaUrlById: Record<number, string>;
}) {
  const router = useRouter();
  const isEdit = Boolean(product);
  // Create mode is unaffected - create access itself is still manager/
  // owner-only server-side (unchanged), so a cashier can't reach a create
  // dialog in practice; this only kicks in for editing an existing product.
  const fieldsDisabled = isEdit && !canEditFields;
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
    taxRate: product ? String(product.taxRate) : '0',
    reorderPoint: product?.reorderPoint != null ? String(product.reorderPoint) : '0',
    maxDiscountAmount: product?.maxDiscountAmount != null ? String(product.maxDiscountAmount) : '0',
  });
  const [imageId, setImageId] = useState<number | null>(product?.image ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(
    product?.image != null ? (mediaUrlById[product.image] ?? null) : null,
  );
  const [variants, setVariants] = useState<WorkingVariant[]>(
    (product?.variants ?? []).map((v) => ({
      ...v,
      imageUrl: v.image != null ? (mediaUrlById[v.image] ?? null) : null,
    })),
  );
  const [relatedProducts, setRelatedProducts] = useState<number[]>(product?.relatedProducts ?? []);

  const savedVariants = variants.filter((v): v is Variant & { id: string } => Boolean(v.id));
  const [stockForm, setStockForm] = useState({
    storeId: stores[0] ? String(stores[0].id) : '',
    variantId: savedVariants[0]?.id ?? NO_VARIANT,
    type: 'restock' as (typeof STOCK_TYPES)[number]['value'],
    quantity: '',
  });
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function updateVariantLabel(index: number) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, label: e.target.value } : v)));
  }

  function updateVariantImage(index: number) {
    return (nextImageId: number | null, nextImageUrl: string | null) =>
      setVariants((prev) =>
        prev.map((v, i) => (i === index ? { ...v, image: nextImageId, imageUrl: nextImageUrl } : v)),
      );
  }

  // Blank means "inherit the product's own price" - stored as undefined
  // (dropped from the JSON body entirely) rather than 0, which would
  // actually mean "free."
  function updateVariantPrice(index: number, field: 'sellPrice' | 'costPrice') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const parsed = raw === '' ? undefined : Number(raw);
      setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: parsed } : v)));
    };
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

    try {
      const response = await clientFetch(isEdit ? `/api/payload/products/${product!.id}` : '/api/payload/products', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: form.sku,
          barcode: form.barcode || null,
          name: form.name,
          category: form.category,
          image: imageId,
          costPrice: Number(form.costPrice) || 0,
          sellPrice: Number(form.sellPrice) || 0,
          taxRate: Number(form.taxRate) || 0,
          reorderPoint: Number(form.reorderPoint) || 0,
          maxDiscountAmount: Number(form.maxDiscountAmount) || 0,
          variants: variants
            .filter((v) => v.label.trim())
            .map((v) => ({
              id: v.id,
              label: v.label,
              sku: v.sku,
              barcode: v.barcode,
              sellPrice: v.sellPrice,
              costPrice: v.costPrice,
              image: v.image,
            })),
          relatedProducts,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = errorMessageFrom(body, `Failed to ${isEdit ? 'update' : 'create'} product`);
        setError(message);
        toast.error(message);
        return;
      }

      setOpen(false);
      toast.success(isEdit ? 'Product updated' : 'Product created');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleArchiveToggle() {
    if (!product) return;
    setArchiveLoading(true);
    const nextActive = !product.isActive;
    try {
      const response = await clientFetch(`/api/payload/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(errorMessageFrom(body, 'Failed to update product'));
        return;
      }
      toast.success(nextActive ? 'Product restored' : 'Product archived');
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setArchiveLoading(false);
    }
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
    try {
      const response = await clientFetch('/api/payload/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          product: product.id,
          variant: stockForm.variantId === NO_VARIANT ? null : stockForm.variantId,
          store: Number(stockForm.storeId),
          quantityDelta,
          reason: stockForm.type,
          clientTimestamp: new Date().toISOString(),
          sourceTerminal: 'dashboard',
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = errorMessageFrom(body, 'Failed to record the stock movement');
        setStockError(message);
        toast.error(message);
        return;
      }

      setStockForm((f) => ({ ...f, quantity: '' }));
      toast.success('Stock movement recorded');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStockError(message);
      toast.error(message);
    } finally {
      setStockLoading(false);
    }
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
          {fieldsDisabled ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Only owners/managers can edit a product&apos;s details - you can still update its photo below.
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" required disabled={fieldsDisabled} value={form.name} onChange={update('name')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Category</Label>
            <Input id="category" disabled={fieldsDisabled} value={form.category} onChange={update('category')} />
          </div>
          <ImageField
            label="Product image"
            imageUrl={imageUrl}
            onChange={(nextId, nextUrl) => {
              setImageId(nextId);
              setImageUrl(nextUrl);
            }}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {canSeeCost ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="costPrice">Cost price</Label>
                <Input id="costPrice" type="number" step="0.01" disabled={fieldsDisabled} value={form.costPrice} onChange={update('costPrice')} />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sellPrice">Sell price</Label>
              <Input id="sellPrice" type="number" step="0.01" disabled={fieldsDisabled} value={form.sellPrice} onChange={update('sellPrice')} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxRate">Tax rate</Label>
              <Input id="taxRate" type="number" step="0.01" disabled={fieldsDisabled} value={form.taxRate} onChange={update('taxRate')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reorderPoint">Reorder point</Label>
              <Input id="reorderPoint" type="number" step="1" disabled={fieldsDisabled} value={form.reorderPoint} onChange={update('reorderPoint')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maxDiscountAmount">Max discount</Label>
              <Input
                id="maxDiscountAmount"
                type="number"
                step="0.01"
                min="0"
                disabled={fieldsDisabled}
                value={form.maxDiscountAmount}
                onChange={update('maxDiscountAmount')}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Variants</Label>
              <Button type="button" variant="outline" size="sm" disabled={fieldsDisabled} onClick={addVariant}>
                Add variant
              </Button>
            </div>
            {variants.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No variants - this product is sold as-is. Add one for options like size or color (e.g. &quot;Red /
                L&quot;) - each can optionally have its own price, and stock is always tracked separately per variant.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {variants.map((variant, index) => (
                  <div key={index} className="flex flex-col gap-2 rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="e.g. Red / L"
                        disabled={fieldsDisabled}
                        value={variant.label}
                        onChange={updateVariantLabel(index)}
                        className="min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={fieldsDisabled}
                        onClick={() => removeVariant(index)}
                        aria-label="Remove variant"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                    <ImageField
                      label="Variant image"
                      imageUrl={variant.imageUrl ?? null}
                      onChange={updateVariantImage(index)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Sell price</Label>
                        <Input
                          type="number"
                          step="0.01"
                          disabled={fieldsDisabled}
                          placeholder={form.sellPrice || '0'}
                          value={variant.sellPrice ?? ''}
                          onChange={updateVariantPrice(index, 'sellPrice')}
                        />
                      </div>
                      {canSeeCost ? (
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">Cost price</Label>
                          <Input
                            type="number"
                            step="0.01"
                            disabled={fieldsDisabled}
                            placeholder={form.costPrice || '0'}
                            value={variant.costPrice ?? ''}
                            onChange={updateVariantPrice(index, 'costPrice')}
                          />
                        </div>
                      ) : null}
                    </div>
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
              disabled={fieldsDisabled}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            {isEdit ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant={product!.isActive ? 'destructive' : 'outline'} disabled={archiveLoading || fieldsDisabled}>
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
                  <div key={stockKey(level.product, level.variant)} className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {stores.find((s) => s.id === level.store)?.name ?? `Store #${level.store}`}
                      {level.variantLabel ? ` · ${level.variantLabel}` : ''}
                    </span>
                    <span className="font-medium tabular-nums">{level.quantity}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-1 flex flex-col gap-2">
              <div className={savedVariants.length > 0 ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : ''}>
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
                {savedVariants.length > 0 ? (
                  <div className="flex min-w-0 flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Variant</Label>
                    <Select
                      value={stockForm.variantId}
                      onValueChange={(v) => setStockForm((f) => ({ ...f, variantId: v }))}
                    >
                      <SelectTrigger className="w-full">
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
              </div>
              <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
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
            </div>
            {stockError ? <p className="text-sm text-destructive">{stockError}</p> : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
