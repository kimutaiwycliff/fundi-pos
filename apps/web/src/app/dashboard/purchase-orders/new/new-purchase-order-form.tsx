'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Minus, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Store = { id: number; name: string };
type Supplier = { id: number; name: string };
type Suggestion = {
  productId: number;
  variant: string | null;
  productName: string;
  variantLabel: string | null;
  costPrice: number | null;
  reason: 'low-stock' | 'fast-moving' | 'both';
};
type Product = {
  id: number;
  name: string;
  costPrice: number;
  variants?: Array<{ id: string; label: string; costPrice?: number }>;
};
type Line = {
  productId: number;
  variant: string | null;
  productName: string;
  variantLabel: string | null;
  quantity: number;
  unitCost: number;
};

function lineKey(productId: number, variant: string | null) {
  return `${productId}::${variant ?? ''}`;
}

export function NewPurchaseOrderForm({
  stores,
  suppliers,
  canSeeCost,
}: {
  stores: Store[];
  suppliers: Supplier[];
  canSeeCost: boolean;
}) {
  const router = useRouter();
  const [storeId, setStoreId] = useState<string>('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [supplierList, setSupplierList] = useState(suppliers);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    fetch(`/api/payload/reports/restock-suggestions?store=${storeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setSuggestions(data.suggestions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  useEffect(() => {
    if (query.trim().length < 2) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      fetch(`/api/payload/products?where[name][like]=${encodeURIComponent(query)}&limit=10`)
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setSearchResults(data.docs ?? []);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  function addLine(productId: number, variant: string | null, productName: string, variantLabel: string | null, unitCost: number) {
    setLines((prev) => {
      const key = lineKey(productId, variant);
      if (prev.some((l) => lineKey(l.productId, l.variant) === key)) return prev;
      return [...prev, { productId, variant, productName, variantLabel, quantity: 1, unitCost }];
    });
  }

  function addSuggestion(s: Suggestion) {
    addLine(s.productId, s.variant, s.productName, s.variantLabel, s.costPrice ?? 0);
  }

  function addProduct(p: Product) {
    if (p.variants && p.variants.length > 0) {
      for (const v of p.variants) addLine(p.id, v.id, p.name, v.label, v.costPrice ?? p.costPrice);
    } else {
      addLine(p.id, null, p.name, null, p.costPrice);
    }
  }

  function updateQuantity(key: string, quantity: number) {
    setLines((prev) => prev.map((l) => (lineKey(l.productId, l.variant) === key ? { ...l, quantity: Math.max(0.001, quantity) } : l)));
  }
  function updateUnitCost(key: string, unitCost: number) {
    setLines((prev) => prev.map((l) => (lineKey(l.productId, l.variant) === key ? { ...l, unitCost: Math.max(0, unitCost) } : l)));
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => lineKey(l.productId, l.variant) !== key));
  }

  const estimatedTotal = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);

  async function createSupplier() {
    if (!newSupplierName.trim()) return;
    setCreatingSupplier(true);
    try {
      const response = await fetch('/api/payload/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSupplierName.trim() }),
      });
      if (!response.ok) throw new Error('Failed to create supplier');
      const { doc } = await response.json();
      setSupplierList((prev) => [...prev, doc]);
      setSupplierId(String(doc.id));
      setNewSupplierName('');
      toast.success('Supplier added');
    } catch {
      toast.error('Could not add supplier');
    } finally {
      setCreatingSupplier(false);
    }
  }

  async function handleSave() {
    if (!storeId || !supplierId || lines.length === 0) {
      toast.error('Pick a store, a supplier, and at least one item');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/payload/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: Number(storeId),
          supplier: Number(supplierId),
          status: 'draft',
          lineItems: lines.map((l) => ({
            product: l.productId,
            variant: l.variant ?? undefined,
            quantity: l.quantity,
            unitCost: l.unitCost,
          })),
        }),
      });
      if (!response.ok) throw new Error('Failed to save');
      const { doc } = await response.json();
      toast.success('Restock list saved');
      router.push(`/dashboard/purchase-orders/${doc.id}`);
    } catch {
      toast.error('Could not save restock list');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Store</Label>
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a store" />
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
        <div className="space-y-2">
          <Label>Supplier</Label>
          <div className="flex gap-2">
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a supplier" />
              </SelectTrigger>
              <SelectContent>
                {supplierList.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {supplierList.length === 0 ? (
            <div className="flex gap-2">
              <Input
                placeholder="New supplier name"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={createSupplier} disabled={creatingSupplier}>
                Add
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {storeId && suggestions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suggested for this store</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {suggestions.map((s) => {
              const key = lineKey(s.productId, s.variant);
              const added = lines.some((l) => lineKey(l.productId, l.variant) === key);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={added}
                  onClick={() => addSuggestion(s)}
                  className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                >
                  {s.productName}
                  {s.variantLabel ? ` (${s.variantLabel})` : ''}
                  <Badge variant={s.reason === 'both' ? 'default' : 'secondary'} className="text-xs">
                    {s.reason === 'low-stock' ? 'Low stock' : s.reason === 'fast-moving' ? 'Fast moving' : 'Low stock + fast moving'}
                  </Badge>
                </button>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-2">
        <Label>Search for other products</Label>
        <div className="relative">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search products..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {query.trim().length >= 2 && searchResults.length > 0 ? (
          <div className="rounded-lg border divide-y">
            {searchResults.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addProduct(p)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {p.name}
                <Plus className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Items ({lines.length})</Label>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items added yet.</p>
        ) : (
          <div className="space-y-2">
            {lines.map((l) => {
              const key = lineKey(l.productId, l.variant);
              return (
                <div key={key} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.productName}</p>
                    {l.variantLabel ? <p className="truncate text-xs text-muted-foreground">{l.variantLabel}</p> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="icon" onClick={() => updateQuantity(key, l.quantity - 1)}>
                      <Minus className="size-3.5" />
                    </Button>
                    <Input
                      type="number"
                      className="w-16 text-center"
                      value={l.quantity}
                      onChange={(e) => updateQuantity(key, Number(e.target.value) || 0)}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={() => updateQuantity(key, l.quantity + 1)}>
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                  {canSeeCost ? (
                    <Input
                      type="number"
                      className="w-24"
                      value={l.unitCost}
                      onChange={(e) => updateUnitCost(key, Number(e.target.value) || 0)}
                    />
                  ) : null}
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(key)}>
                    <X className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canSeeCost && lines.length > 0 ? (
        <p className="text-right text-lg font-semibold">Estimated total: {estimatedTotal.toFixed(2)}</p>
      ) : null}

      <Button onClick={handleSave} disabled={saving} size="lg">
        {saving ? 'Saving...' : 'Save restock list'}
      </Button>
    </div>
  );
}
