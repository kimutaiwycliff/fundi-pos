import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { View, Text, TextInput, Pressable, FlatList, Alert, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getDb } from '../db/database';
import { useMutedPlaceholderColor } from '../lib/theme';
import type { PayloadUser } from '../lib/auth';
import { fetchSuppliers, createSupplier, createPurchaseOrder, type RestockSuggestion, type Supplier } from './purchaseOrders';
import { buildRestockListHtml } from './restockListHtml';

interface CatalogProduct {
  id: number;
  name: string;
  sku: string;
  cost_price: number;
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
// comment) but the SUGGESTIONS below are computed fully offline from
// already-synced local tables - same derived-sum stock-levels approach as
// InventoryScreen, plus a fast-movers query mirroring SellScreen's own
// "frequently sold" local SQL pattern, so this screen is useful the moment
// it opens even before any network round trip completes.
export function RestockScreen({ user, storeId, payloadToken }: { user: PayloadUser; storeId: number | null; payloadToken: string }) {
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
  const placeholderColor = useMutedPlaceholderColor();
  const canSeeCost = user.role === 'owner';

  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (storeId == null) return;
    let active = true;

    // Local, offline: low-stock (reorder point) unioned with fast-movers
    // (quantity sold in the last 30 days), same shape as the web/API
    // suggestions endpoint but computed from the on-device replica.
    getDb()
      .getAll<{ product_id: number; product_name: string; cost_price: number; quantity: number; reorder_point: number }>(
        `SELECT p.id AS product_id, p.name AS product_name, p.cost_price AS cost_price, p.reorder_point AS reorder_point,
                COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm WHERE sm.product_id = p.id AND sm.store_id = ? AND sm.variant IS NULL), 0) AS quantity
         FROM products p
         WHERE p.tenant_id = ? AND p.is_active = 1
           AND NOT EXISTS (SELECT 1 FROM products_variants pv WHERE pv._parent_id = p.id)`,
        [storeId, tenantId],
      )
      .then((rows) => {
        if (!active) return;
        const lowStock = rows
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
        setSuggestions(lowStock);
      });

    getDb()
      .getAll<{ product_id: number; sold: number }>(
        `SELECT oli.product_id, SUM(oli.quantity) AS sold
         FROM orders_line_items oli
         JOIN orders o ON o.id = oli._parent_id
         WHERE o.store_id = ? AND o.created_at >= datetime('now', '-30 days')
         GROUP BY oli.product_id
         ORDER BY sold DESC
         LIMIT 15`,
        [storeId],
      )
      .then((rows) => {
        if (!active || rows.length === 0) return;
        getDb()
          .getAll<{ id: number; name: string; cost_price: number }>(
            `SELECT id, name, cost_price FROM products WHERE id IN (${rows.map(() => '?').join(',')})`,
            rows.map((r) => r.product_id),
          )
          .then((products) => {
            if (!active) return;
            const byId = new Map(products.map((p) => [p.id, p]));
            setSuggestions((prev) => {
              const existingKeys = new Set(prev.map((s) => lineKey(s.productId, s.variant)));
              const fastMovers = rows
                .filter((r) => !existingKeys.has(lineKey(r.product_id, null)))
                .map((r) => {
                  const p = byId.get(r.product_id);
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
              return [...prev, ...fastMovers];
            });
          });
      });

    getDb()
      .getAll<CatalogProduct>(`SELECT id, name, sku, cost_price FROM products WHERE tenant_id = ? AND is_active = 1 ORDER BY name LIMIT 5000`, [tenantId])
      .then((rows) => {
        if (active) setCatalog(rows);
      });

    fetchSuppliers(payloadToken).then((rows) => {
      if (active) setSuppliers(rows);
    });

    return () => {
      active = false;
    };
  }, [storeId, tenantId, payloadToken, canSeeCost]);

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
