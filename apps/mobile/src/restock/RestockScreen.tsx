import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Fuse from 'fuse.js';
import { View, Text, TextInput, Pressable, FlatList, Alert, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useMutedPlaceholderColor } from '../lib/theme';
import { API_BASE_URL, type PayloadUser } from '../lib/auth';
import { fetchCatalog, fetchStockLevels, stockKey, stockByKeyMap, type CatalogProduct as RawCatalogProduct } from '../lib/catalog';
import { fetchSuppliers, createSupplier, createPurchaseOrder, type RestockSuggestion, type Supplier } from './purchaseOrders';
import { buildRestockListHtml } from './restockListHtml';

interface CatalogProduct {
  id: number;
  name: string;
  sku: string;
  cost_price: number;
}

interface RawRecentOrder {
  lineItems: Array<{ product: { id: number } | number; quantity: number }>;
}

interface Line {
  productId: number;
  variant: string | null;
  productName: string;
  variantLabel: string | null;
  quantity: string;
  unitCost: string;
}

function lineKey(productId: number, variant: string | null) {
  return `${productId}::${variant ?? ''}`;
}

// Restocking is deliberately online-only (see purchaseOrders.ts's header
// comment), and now so are the SUGGESTIONS below too - there is no local
// database left to compute them from offline. Low-stock uses the same
// catalog+stock-levels REST fetch as InventoryScreen; fast-movers re-derives
// SellScreen's own "frequently sold" logic from a plain /api/orders fetch
// instead of a local SQL aggregate.
export function RestockScreen({ user, storeId, payloadToken }: { user: PayloadUser; storeId: number | null; payloadToken: string }) {
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
  const placeholderColor = useMutedPlaceholderColor();
  // Matches Products.ts's own costPrice field access - owner and manager.
  const canSeeCost = user.role === 'owner' || user.role === 'manager';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const [rawCatalog, setRawCatalog] = useState<RawCatalogProduct[]>([]);
  const [stockByKey, setStockByKey] = useState<Map<string, number>>(new Map());
  const [recentOrders, setRecentOrders] = useState<RawRecentOrder[]>([]);

  // Fetched together and re-fetched on tab-focus - this screen previously
  // read all of this via one-shot getDb().getAll() calls with no refresh
  // mechanism at all, so a restock suggestion could silently go stale (e.g.
  // after a sale just dropped a product below its reorder point) until the
  // screen was fully remounted; useFocusEffect below fixes that too.
  const refresh = useCallback(async () => {
    if (storeId == null) {
      setRawCatalog([]);
      setStockByKey(new Map());
      setRecentOrders([]);
      return;
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const [catalog, levels, ordersBody] = await Promise.all([
      fetchCatalog(payloadToken, tenantId),
      fetchStockLevels(payloadToken, storeId),
      fetch(
        `${API_BASE_URL}/api/orders?where[store][equals]=${storeId}&where[status][equals]=completed&where[createdAt][greater_than_equal]=${cutoff.toISOString()}&sort=-createdAt&limit=1000&depth=0`,
        { headers: { Authorization: `JWT ${payloadToken}` } },
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    setRawCatalog(catalog);
    setStockByKey(stockByKeyMap(levels));
    setRecentOrders(ordersBody?.docs ?? []);
  }, [storeId, payloadToken, tenantId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Bare (no-variant) active products only - a restock suggestion adds a
  // single product line with no variant picker, matching the old SQL's own
  // `NOT EXISTS ... products_variants` exclusion.
  const lowStockRows = useMemo(
    () =>
      rawCatalog
        .filter((p) => p.variants.length === 0)
        .map((p) => ({ product_id: p.id, product_name: p.name, cost_price: p.costPrice, reorder_point: p.reorderPoint, quantity: stockByKey.get(stockKey(p.id, null)) ?? 0 })),
    [rawCatalog, stockByKey],
  );

  const fastMoverRows = useMemo(() => {
    const sold = new Map<number, number>();
    for (const o of recentOrders) {
      for (const li of o.lineItems ?? []) {
        const productId = typeof li.product === 'object' ? li.product.id : li.product;
        sold.set(productId, (sold.get(productId) ?? 0) + li.quantity);
      }
    }
    return [...sold.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([product_id, soldQty]) => ({ product_id, sold: soldQty }));
  }, [recentOrders]);

  const catalog = useMemo<CatalogProduct[]>(() => rawCatalog.map((p) => ({ id: p.id, name: p.name, sku: p.sku, cost_price: p.costPrice })), [rawCatalog]);

  // Combines the two derived lists above the same way the original one-shot
  // effect did: low-stock first, then fast movers not already covered by a
  // low-stock suggestion - looked up against the already-fetched active
  // catalog (a Map) rather than a second network round trip keyed off
  // fastMoverRows. A fast mover whose product has since been deactivated
  // won't resolve a catalog match here (falls back to the same `#id`/cost-0
  // placeholder a since-deleted product would) - arguably more correct for a
  // restock suggestion.
  const suggestions = useMemo<RestockSuggestion[]>(() => {
    const lowStock = lowStockRows
      .filter((r) => r.reorder_point > 0 && r.quantity <= r.reorder_point)
      .map((r) => ({
        productId: r.product_id,
        variant: null,
        productName: r.product_name,
        variantLabel: null,
        costPrice: canSeeCost ? r.cost_price : null,
        sellPrice: 0,
        reason: 'low-stock' as const,
      }));
    const existingKeys = new Set(lowStock.map((s) => lineKey(s.productId, s.variant)));
    const catalogById = new Map(catalog.map((p) => [Number(p.id), p]));
    const fastMovers = fastMoverRows
      .filter((r) => !existingKeys.has(lineKey(r.product_id, null)))
      .map((r) => {
        const p = catalogById.get(r.product_id);
        return {
          productId: r.product_id,
          variant: null,
          productName: p?.name ?? `#${r.product_id}`,
          variantLabel: null,
          costPrice: canSeeCost ? (p?.cost_price ?? 0) : null,
          sellPrice: 0,
          reason: 'fast-moving' as const,
        };
      });
    return [...lowStock, ...fastMovers];
  }, [lowStockRows, fastMoverRows, catalog, canSeeCost]);

  // Suppliers stay a plain one-shot REST fetch (not PowerSync/local) -
  // matches the header comment above on restocking being deliberately
  // online-only.
  useEffect(() => {
    let active = true;
    fetchSuppliers(payloadToken).then((rows) => {
      if (active) setSuppliers(rows);
    });
    return () => {
      active = false;
    };
  }, [payloadToken]);

  const searchResults = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const fuse = new Fuse(catalog, { threshold: 0.4, ignoreLocation: true, keys: ['name', 'sku'] });
    return fuse.search(trimmed).slice(0, 10).map((r) => r.item);
  }, [query, catalog]);

  function addLine(productId: number, variant: string | null, productName: string, variantLabel: string | null, unitCost: number) {
    setLines((prev) => {
      const key = lineKey(productId, variant);
      if (prev.some((l) => lineKey(l.productId, l.variant) === key)) return prev;
      return [...prev, { productId, variant, productName, variantLabel, quantity: '1', unitCost: String(unitCost) }];
    });
  }

  function updateLine(key: string, field: 'quantity' | 'unitCost', value: string) {
    setLines((prev) => prev.map((l) => (lineKey(l.productId, l.variant) === key ? { ...l, [field]: value } : l)));
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => lineKey(l.productId, l.variant) !== key));
  }

  const estimatedTotal = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  async function handleAddSupplier() {
    if (!newSupplierName.trim()) return;
    const created = await createSupplier(payloadToken, newSupplierName.trim());
    if (created) {
      setSuppliers((prev) => [...prev, created]);
      setSupplierId(created.id);
      setNewSupplierName('');
    } else {
      Alert.alert('Could not add supplier');
    }
  }

  async function handleSave() {
    if (storeId == null || !supplierId || lines.length === 0) {
      Alert.alert('Pick a supplier and add at least one item');
      return;
    }
    setSaving(true);
    const doc = await createPurchaseOrder(payloadToken, {
      store: storeId,
      supplier: supplierId,
      lineItems: lines.map((l) => ({
        product: l.productId,
        variant: l.variant ?? undefined,
        quantity: Number(l.quantity) || 0,
        unitCost: Number(l.unitCost) || 0,
      })),
    });
    setSaving(false);
    if (!doc) {
      Alert.alert('Could not save - check your connection');
      return;
    }
    Alert.alert('Saved', `Restock list #${doc.id} saved.`);
    setLines([]);
  }

  async function handleGenerateDocument() {
    const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? 'Supplier';
    const html = buildRestockListHtml(
      {
        poNumber: 'DRAFT',
        storeName: `Store #${storeId}`,
        supplierName,
        createdAtLabel: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        lines: lines.map((l) => ({
          productName: l.productName,
          variantLabel: l.variantLabel,
          quantity: Number(l.quantity) || 0,
          unitCost: canSeeCost ? Number(l.unitCost) || 0 : null,
        })),
        estimatedTotal: canSeeCost ? estimatedTotal : null,
      },
      { name: user.name ?? user.email },
    );
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share restock list' });
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <FlatList
        className="flex-1 bg-background px-4 pt-3"
        data={lines}
        keyExtractor={(l) => lineKey(l.productId, l.variant)}
        ListHeaderComponent={
          <View className="gap-4 pb-3">
            <View>
              <Text className="text-xs text-muted-foreground">Supplier</Text>
              <View className="mt-1 flex-row flex-wrap gap-2">
                {suppliers.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setSupplierId(s.id)}
                    className={`rounded-full border px-3 py-1.5 ${supplierId === s.id ? 'border-primary bg-primary/10' : 'border-border'}`}
                  >
                    <Text className="text-sm text-foreground">{s.name}</Text>
                  </Pressable>
                ))}
              </View>
              <View className="mt-2 flex-row gap-2">
                <TextInput
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-foreground"
                  placeholder="New supplier name"
                  placeholderTextColor={placeholderColor}
                  value={newSupplierName}
                  onChangeText={setNewSupplierName}
                />
                <Pressable onPress={handleAddSupplier} className="items-center justify-center rounded-lg bg-card px-3 border border-border">
                  <Text className="text-foreground">Add</Text>
                </Pressable>
              </View>
            </View>

            {suggestions.length > 0 ? (
              <View>
                <Text className="text-xs text-muted-foreground">Suggested for this store</Text>
                <View className="mt-1 flex-row flex-wrap gap-2">
                  {suggestions.map((s) => {
                    const key = lineKey(s.productId, s.variant);
                    const added = lines.some((l) => lineKey(l.productId, l.variant) === key);
                    return (
                      <Pressable
                        key={key}
                        disabled={added}
                        onPress={() => addLine(s.productId, s.variant, s.productName, s.variantLabel, s.costPrice ?? 0)}
                        className={`rounded-full border border-border px-3 py-1.5 ${added ? 'opacity-40' : ''}`}
                      >
                        <Text className="text-sm text-foreground">
                          {s.productName} · {s.reason === 'low-stock' ? 'Low stock' : 'Fast moving'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View>
              <Text className="text-xs text-muted-foreground">Search products</Text>
              <TextInput
                className="mt-1 rounded-lg border border-border bg-card px-3 py-2 text-foreground"
                placeholder="Search products..."
                placeholderTextColor={placeholderColor}
                value={query}
                onChangeText={setQuery}
              />
              {searchResults.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => addLine(p.id, null, p.name, null, p.cost_price)}
                  className="border-b border-border py-2"
                >
                  <Text className="text-foreground">{p.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text className="text-xs text-muted-foreground">Items ({lines.length})</Text>
          </View>
        }
        renderItem={({ item: l }) => {
          const key = lineKey(l.productId, l.variant);
          return (
            <View className="mb-2 flex-row items-center gap-2 rounded-lg border border-border bg-card p-3">
              <Text className="flex-1 text-foreground">{l.productName}</Text>
              <TextInput
                className="w-14 rounded-lg border border-border px-2 py-1 text-center text-foreground"
                keyboardType="numeric"
                value={l.quantity}
                onChangeText={(v) => updateLine(key, 'quantity', v)}
              />
              {canSeeCost ? (
                <TextInput
                  className="w-20 rounded-lg border border-border px-2 py-1 text-foreground"
                  keyboardType="numeric"
                  value={l.unitCost}
                  onChangeText={(v) => updateLine(key, 'unitCost', v)}
                />
              ) : null}
              <Pressable onPress={() => removeLine(key)}>
                <Text className="text-destructive">Remove</Text>
              </Pressable>
            </View>
          );
        }}
        ListFooterComponent={
          <View className="gap-3 pb-8 pt-2">
            {canSeeCost && lines.length > 0 ? (
              <Text className="text-right text-lg font-semibold text-foreground">Estimated total: {estimatedTotal.toFixed(2)}</Text>
            ) : null}
            <View className="flex-row gap-2">
              <Pressable onPress={handleGenerateDocument} disabled={lines.length === 0} className="flex-1 items-center rounded-lg border border-border py-3">
                <Text className="text-foreground">Generate document</Text>
              </Pressable>
              <Pressable onPress={handleSave} disabled={saving} className="flex-1 items-center rounded-lg bg-primary py-3">
                <Text className="font-medium text-primary-foreground">{saving ? 'Saving...' : 'Save restock list'}</Text>
              </Pressable>
            </View>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}
