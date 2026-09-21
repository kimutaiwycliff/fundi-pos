'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';
import { FileText, Store as StoreIcon } from 'lucide-react';
import { stockKey } from '@/lib/stock-key';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';
import type { CurrentUser } from '@/lib/current-user';
import { ProductSearch } from '../../sell/product-search';
import { VariantPickerDialog } from '../../sell/variant-picker-dialog';
import type { Product, StoreRef } from '../../sell/page';

// A quotation line is deliberately much simpler than the Sell cart's
// CartLine (sell/types.ts) - no discount, no stock concept, and the price
// is a plain free-text starting point rather than something clamped
// against a per-product cap. `key` is purely a stable React key (a
// product/variant can appear on more than one line at different
// negotiated prices, so it can't double as a dedupe key the way the Sell
// cart's product+variant pair does).
interface QuotationLine {
  key: string;
  product: Product;
  variantId: string | null;
  label: string;
  quantity: number;
  unitPrice: number;
}

function resolveVariant(product: Product, variantId: string | null) {
  if (!variantId) return null;
  return product.variants.find((v) => v.id === variantId) ?? null;
}

export function QuotationBuilder({
  me,
  products,
  stores,
  mediaUrlById,
}: {
  me: CurrentUser;
  products: Product[];
  stores: StoreRef[];
  mediaUrlById: Record<number, string>;
}) {
  const router = useRouter();

  const fixedStoreId = me.store == null ? null : typeof me.store === 'object' ? me.store.id : me.store;
  const [pickedStoreId, setPickedStoreId] = useState<number | null>(stores[0]?.id ?? null);
  const activeStoreId = fixedStoreId ?? pickedStoreId;

  const [lines, setLines] = useState<QuotationLine[]>([]);
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ProductSearch/VariantPickerDialog are shared with the Sell page and
  // disable+grey out anything with zero stock-on-hand there - but a
  // quotation is never gated by stock (a manager can quote an item that's
  // currently out of stock, e.g. a special order), so a real stock lookup
  // would wrongly block exactly the items this feature most needs to
  // support. An empty map isn't an option either - that marks *every*
  // product out of stock and disables the whole picker. This sentinel map
  // (every product/variant "in stock") is what actually satisfies "no
  // stock-quantity gating" while reusing those two components unmodified.
  const stockByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) {
      map.set(stockKey(product.id, null), Infinity);
      for (const variant of product.variants) {
        if (variant.id) map.set(stockKey(product.id, variant.id), Infinity);
      }
    }
    return map;
  }, [products]);

  function addLine(product: Product, variantId: string | null) {
    const variant = resolveVariant(product, variantId);
    const label = variant ? `${product.name} — ${variant.label}` : product.name;
    const unitPrice = variant?.sellPrice ?? product.sellPrice;
    setLines((prev) => [
      ...prev,
      { key: crypto.randomUUID(), product, variantId, label, quantity: 1, unitPrice },
    ]);
  }

  // A product with variants is never quoted as its bare self - same rule
  // as sell-client.tsx's requestAdd.
  function requestAdd(product: Product) {
    if (product.variants.length > 0) {
      setVariantPickerProduct(product);
    } else {
      addLine(product, null);
    }
  }

  function updateQuantity(key: string, quantity: number) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)));
  }

  function updateUnitPrice(key: string, unitPrice: number) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, unitPrice } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  async function handleSubmit() {
    if (lines.length === 0) {
      toast.error('Add at least one line item');
      return;
    }
    setSubmitting(true);
    try {
      const response = await clientFetch('/api/payload/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          notes: notes || null,
          ...(activeStoreId != null ? { store: activeStoreId } : {}),
          lineItems: lines.map((l) => ({
            product: l.product.id,
            variant: l.variantId,
            label: l.label,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(errorMessageFrom(body, 'Failed to create quotation'));
        return;
      }

      toast.success('Quotation created');
      router.push('/dashboard/quotations/' + body.doc.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">New quotation</h1>
        {fixedStoreId == null && stores.length > 1 ? (
          <Select
            value={activeStoreId != null ? String(activeStoreId) : undefined}
            onValueChange={(v) => setPickedStoreId(Number(v))}
          >
            <SelectTrigger className="w-44">
              <StoreIcon data-icon="inline-start" />
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((store) => (
                <SelectItem key={store.id} value={String(store.id)}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <ProductSearch products={products} stockByKey={stockByKey} mediaUrlById={mediaUrlById} onSelect={requestAdd} />
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 rounded-lg border p-4 lg:w-96">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customerName">Customer name</Label>
              <Input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customerPhone">Customer phone</Label>
              <Input
                id="customerPhone"
                placeholder="0712345678"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="e.g. Valid for 14 days, prices exclude delivery..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Line items</h2>
              <span className="text-xs text-muted-foreground">
                {lines.length} item{lines.length === 1 ? '' : 's'}
              </span>
            </div>
            {lines.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No items yet"
                description="Search for a product to add it to this quotation."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {lines.map((line) => (
                  <div key={line.key} className="flex flex-col gap-2 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{line.label}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={() => removeLine(line.key)}
                        aria-label={`Remove ${line.label}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Qty</Label>
                        <Input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={line.quantity}
                          onChange={(e) => updateQuantity(line.key, Number(e.target.value) || 0)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Unit price</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) => updateUnitPrice(line.key, Number(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <p className="text-right text-sm font-medium">{(line.quantity * line.unitPrice).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-right text-lg font-semibold">Total: {total.toFixed(2)}</p>
            <Button type="button" size="lg" disabled={submitting || lines.length === 0} onClick={handleSubmit}>
              {submitting ? 'Creating...' : 'Create quotation'}
            </Button>
          </div>
        </aside>
      </div>

      <VariantPickerDialog
        product={variantPickerProduct}
        stockByKey={stockByKey}
        onSelect={(variantId) => {
          if (variantPickerProduct) addLine(variantPickerProduct, variantId);
          setVariantPickerProduct(null);
        }}
        onOpenChange={(open) => {
          if (!open) setVariantPickerProduct(null);
        }}
      />
    </div>
  );
}
