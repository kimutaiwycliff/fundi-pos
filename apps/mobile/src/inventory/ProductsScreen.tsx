import { useCallback, useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { View, Text, TextInput, Pressable, FlatList, Image, Modal, Switch, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutedPlaceholderColor } from '../lib/theme';
import { getDb } from '../db/database';
import { API_BASE_URL } from '../lib/auth';
import type { PayloadUser } from '../lib/auth';
import { showAlert, showToast } from '../components/AppNotice';
import { usePullToRefresh } from '../lib/usePullToRefresh';

interface LocalProductRow {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  cost_price: number;
  sell_price: number;
  tax_rate: number;
  reorder_point: number;
  is_active: number;
  image_url: string | null;
  variant_count: number;
}

interface LocalVariantRow {
  id: number;
  label: string;
  sku: string | null;
  sell_price: number | null;
  cost_price: number | null;
}

interface VariantStock {
  variant_id: number | null;
  quantity: number;
}

// The mobile catalog browser - takes over the bottom tab's "Inventory" slot
// (stock-level auditing moves into More; see RootTabs.tsx) since checking
// what you sell and at what price is a more frequent need than stock
// auditing. Deliberately NOT a full port of the web dashboard's Products
// page (product-dialog.tsx alone is ~700 lines: variants, related
// products, per-store/per-variant stock adjustment) - this is a searchable
// catalog + detail view, with inline editing only for the two fields a
// manager changes often on the floor (sell price, active status). Variant
// editing/related products/multi-store stock stay web-only, same boundary
// this app already draws elsewhere (StockAdjustmentModal does simple
// single-line adjustments; full stock transfers are web-only too).
export function ProductsScreen({ user, payloadToken, storeId }: { user: PayloadUser; payloadToken: string; storeId: number | null }) {
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
  const placeholderColor = useMutedPlaceholderColor();

  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<LocalProductRow[]>([]);
  const [selected, setSelected] = useState<LocalProductRow | null>(null);
  const [variants, setVariants] = useState<LocalVariantRow[]>([]);
  const [stock, setStock] = useState<VariantStock[]>([]);
  const [priceDraft, setPriceDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    getDb()
      .getAll<LocalProductRow>(
        `SELECT p.id, p.name, p.sku, p.barcode, p.category, p.cost_price, p.sell_price, p.tax_rate, p.reorder_point, p.is_active, m.url AS image_url,
                (SELECT COUNT(*) FROM products_variants pv WHERE pv._parent_id = p.id) AS variant_count
         FROM products p
         LEFT JOIN media m ON m.id = p.image_id
         WHERE p.tenant_id = ?
         ORDER BY p.name LIMIT 5000`,
        [tenantId],
      )
      .then(setProducts);
  }, [tenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return products;
    const fuse = new Fuse(products, { threshold: 0.4, ignoreLocation: true, keys: ['name', 'sku', 'barcode', 'category'] });
    return fuse.search(trimmed).map((r) => r.item);
  }, [query, products]);

  function openProduct(product: LocalProductRow) {
    setSelected(product);
    setPriceDraft(String(product.sell_price));
    getDb()
      .getAll<LocalVariantRow>(
        'SELECT id, label, sku, sell_price, cost_price FROM products_variants WHERE _parent_id = ? ORDER BY _order',
        [product.id],
      )
      .then(setVariants);
    if (storeId != null) {
      getDb()
        .getAll<VariantStock>(
          `SELECT NULL AS variant_id, COALESCE(SUM(quantity_delta), 0) AS quantity FROM stock_movements WHERE product_id = ? AND store_id = ? AND variant IS NULL
           UNION ALL
           SELECT pv.id AS variant_id, COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm WHERE sm.variant = pv.id AND sm.store_id = ?), 0) AS quantity
           FROM products_variants pv WHERE pv._parent_id = ?`,
          [product.id, storeId, storeId, product.id],
        )
        .then(setStock);
    } else {
      setStock([]);
    }
  }

  function closeModal() {
    setSelected(null);
    setVariants([]);
    setStock([]);
  }

  // Writes go straight to Payload over REST, same online-only pattern
  // StaffScreen.tsx/StockAdjustmentModal.tsx already use - PowerSync's sync
  // rules are read-only from the client's side, there's no local write path
  // for a replicated table. Local `products` state is updated optimistically
  // right after a successful PATCH rather than waiting for the write to
  // round-trip back down through PowerSync's own sync stream.
  async function savePrice() {
    if (!selected) return;
    const nextPrice = Number(priceDraft);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      showAlert('Invalid price', 'Enter a valid sell price');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/products/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
        body: JSON.stringify({ sellPrice: nextPrice }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showAlert('Failed to save', body?.errors?.[0]?.message ?? 'Could not update sell price');
        return;
      }
      setProducts((prev) => prev.map((p) => (p.id === selected.id ? { ...p, sell_price: nextPrice } : p)));
      setSelected((prev) => (prev ? { ...prev, sell_price: nextPrice } : prev));
      showToast('Sell price updated');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(next: boolean) {
    if (!selected) return;
    const res = await fetch(`${API_BASE_URL}/api/products/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({ isActive: next }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      showAlert('Failed to save', body?.errors?.[0]?.message ?? 'Could not update status');
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === selected.id ? { ...p, is_active: next ? 1 : 0 } : p)));
    setSelected((prev) => (prev ? { ...prev, is_active: next ? 1 : 0 } : prev));
  }

  const priceDirty = selected != null && Number(priceDraft) !== selected.sell_price;
  const bareStock = stock.find((s) => s.variant_id == null)?.quantity ?? 0;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="border-b border-border p-3">
        <Text className="mb-2 text-2xl font-semibold text-foreground">Products</Text>
        <TextInput
          className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          placeholder="Search by name, SKU, or barcode..."
          placeholderTextColor={placeholderColor}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <FlatList
        className="flex-1"
        contentContainerClassName="gap-2 p-3"
        data={results}
        keyExtractor={(p) => String(p.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#df5102" />}
        ListEmptyComponent={<Text className="mt-8 text-center text-muted-foreground">No products found.</Text>}
        renderItem={({ item }) => (
          <Animated.View entering={FadeInDown.duration(200)}>
            <Pressable android_ripple={{}} className="flex-row items-center gap-3 rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => openProduct(item)}>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} className="h-12 w-12 rounded-md bg-muted" resizeMode="cover" />
              ) : (
                <View className="h-12 w-12 items-center justify-center rounded-md bg-muted">
                  <Ionicons name="pricetag-outline" size={18} color="#71717a" />
                </View>
              )}
              <View className="flex-1 shrink">
                <Text className="font-medium text-foreground">
                  {item.name}
                  {item.variant_count > 0 ? ` (${item.variant_count} variants)` : ''}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {item.sku ?? 'No SKU'}
                  {item.category ? ` · ${item.category}` : ''}
                </Text>
              </View>
              <View className="items-end gap-1">
                <Text className="font-semibold text-foreground">{item.sell_price.toFixed(2)}</Text>
                {!item.is_active ? (
                  <View className="rounded-full bg-muted px-2 py-0.5">
                    <Text className="text-[10px] font-medium text-muted-foreground">Inactive</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          </Animated.View>
        )}
      />

      <Modal visible={selected != null} animationType="slide" onRequestClose={closeModal}>
        <SafeAreaView edges={['top']} className="flex-1 bg-background">
          <View className="flex-row items-center justify-between border-b border-border px-4 pb-3">
            <Text className="text-lg font-semibold text-foreground" numberOfLines={1}>
              {selected?.name}
            </Text>
            <Pressable android_ripple={{}} onPress={closeModal}>
              <Text className="text-muted-foreground">Close</Text>
            </Pressable>
          </View>
          {selected ? (
            <ScrollView contentContainerClassName="gap-4 p-4">
              <View className="flex-row items-center justify-between rounded-lg border border-border bg-card p-3">
                <View className="shrink pr-3">
                  <Text className="text-foreground">Active</Text>
                  <Text className="text-xs text-muted-foreground">Inactive products are hidden from Sell</Text>
                </View>
                <Switch value={!!selected.is_active} onValueChange={toggleActive} trackColor={{ true: '#df5102' }} />
              </View>

              <View className="gap-2 rounded-lg border border-border bg-card p-3">
                <Text className="text-xs text-muted-foreground">Sell price</Text>
                <View className="flex-row items-center gap-2">
                  <TextInput
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-foreground"
                    keyboardType="decimal-pad"
                    value={priceDraft}
                    onChangeText={setPriceDraft}
                  />
                  <Pressable
                    android_ripple={{ color: '#ffffff40' }}
                    disabled={!priceDirty || saving}
                    onPress={savePrice}
                    className={`rounded-md bg-primary px-4 py-2 ${!priceDirty || saving ? 'opacity-50' : 'active:opacity-80'}`}
                  >
                    <Text className="font-medium text-primary-foreground">{saving ? 'Saving...' : 'Save'}</Text>
                  </Pressable>
                </View>
              </View>

              <View className="flex-row flex-wrap gap-3">
                <View className="min-w-[45%] flex-1 gap-1 rounded-lg border border-border bg-card p-3">
                  <Text className="text-xs text-muted-foreground">Cost price</Text>
                  <Text className="text-lg font-semibold text-foreground">{selected.cost_price.toFixed(2)}</Text>
                </View>
                <View className="min-w-[45%] flex-1 gap-1 rounded-lg border border-border bg-card p-3">
                  <Text className="text-xs text-muted-foreground">Tax rate</Text>
                  <Text className="text-lg font-semibold text-foreground">{(selected.tax_rate * 100).toFixed(0)}%</Text>
                </View>
                {storeId != null && variants.length === 0 ? (
                  <View className="min-w-[45%] flex-1 gap-1 rounded-lg border border-border bg-card p-3">
                    <Text className="text-xs text-muted-foreground">Stock (this store)</Text>
                    <Text className="text-lg font-semibold text-foreground">{bareStock}</Text>
                  </View>
                ) : null}
                {selected.reorder_point > 0 ? (
                  <View className="min-w-[45%] flex-1 gap-1 rounded-lg border border-border bg-card p-3">
                    <Text className="text-xs text-muted-foreground">Reorder point</Text>
                    <Text className="text-lg font-semibold text-foreground">{selected.reorder_point}</Text>
                  </View>
                ) : null}
              </View>

              {variants.length > 0 ? (
                <View className="gap-1 rounded-lg border border-border bg-card p-3">
                  <Text className="mb-1 text-sm font-medium text-foreground">Variants</Text>
                  {variants.map((v) => {
                    const vStock = stock.find((s) => s.variant_id === v.id)?.quantity;
                    return (
                      <View key={v.id} className="flex-row items-center justify-between border-b border-border/50 py-2">
                        <Text className="text-sm text-foreground">{v.label}</Text>
                        <View className="flex-row items-center gap-3">
                          <Text className="text-sm text-muted-foreground">{(v.sell_price ?? selected.sell_price).toFixed(2)}</Text>
                          {storeId != null ? <Text className="text-sm font-medium text-foreground">{vStock ?? 0} in stock</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                  <Text className="mt-1 text-xs text-muted-foreground">Edit variant details on the web dashboard.</Text>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
