import { useCallback, useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { View, Text, TextInput, Pressable, FlatList, Image, Modal, Switch, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutedPlaceholderColor } from '../lib/theme';
import { getDb } from '../db/database';
import { API_BASE_URL, OFFLINE_MESSAGE } from '../lib/auth';
import type { PayloadUser } from '../lib/auth';
import { showAlert, showToast } from '../components/AppNotice';
import { usePullToRefresh } from '../lib/usePullToRefresh';

interface LocalProductRow {
  // Every PowerSync primary key is TEXT locally regardless of the real
  // Postgres column type (same rule already documented elsewhere in this
  // app, e.g. db/database.ts's own note on stores.id) - id is a string
  // here, unlike the plain replicated INTEGER foreign-key columns
  // (products_variants._parent_id, stock_movements.product_id) that
  // reference it, which is why those get Number(...)'d before binding
  // below.
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  cost_price: number;
  sell_price: number;
  tax_rate: number;
  reorder_point: number;
  is_active: number;
  image_id: number | null;
  image_url: string | null;
  variant_count: number;
}

// A working copy of a variant row, editable in place before an explicit
// "Save variants" commit - mirrors web's product-dialog.tsx's own
// WorkingVariant shape (a local draft carrying an ephemeral display-only
// imageUrl alongside the real image id, stripped back out before send).
// `isNew` rows have no `id` yet (Payload assigns one on save, same as an
// empty label on the web form) and are dropped if left blank, matching
// web's own "filter to rows with a label" rule.
interface WorkingVariant {
  id: string | null;
  label: string;
  sku: string;
  barcode: string;
  sellPrice: string;
  costPrice: string;
  imageId: number | null;
  imageUrl: string | null;
}

interface LocalVariantRow {
  id: string;
  label: string;
  sku: string | null;
  barcode: string | null;
  sell_price: number | null;
  cost_price: number | null;
  image_id: number | null;
  image_url: string | null;
}

interface VariantStock {
  variant_id: string | null;
  quantity: number;
}

// The mobile catalog browser - takes over the bottom tab's "Inventory" slot
// (stock-level auditing moves into More; see RootTabs.tsx) since checking
// what you sell and at what price is a more frequent need than stock
// auditing. Now at full editing parity with web's product-dialog.tsx for
// an *existing* product - image, variants (add/edit/remove, each with
// their own optional image/price override), and related-product linking -
// the one thing still web-only is creating a brand-new product from
// scratch (new products arrive via web or the bulk Excel import; nothing
// in this screen builds one from blank). Per-store stock stays a simple
// read + StockAdjustmentModal-style single adjustment, not a full editor.
export function ProductsScreen({ user, payloadToken, storeId }: { user: PayloadUser; payloadToken: string; storeId: number | null }) {
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
  const placeholderColor = useMutedPlaceholderColor();
  // Matches Products.ts's own field-level access: cost is owner/manager-only,
  // and every other editable field here (price, active, variant label/sku/
  // price, related products) is locked to the same pair server-side now too -
  // this just makes the UI honest about that instead of showing controls
  // that would silently no-op for a cashier. A cashier CAN still change the
  // product's own photo and each variant's photo - image has no access
  // restriction on either side. cost_price itself was previously shown here
  // unconditionally (a real gap: PowerSync replicates the raw column to
  // every device regardless of role, since field-level Payload access only
  // applies to the REST API, not the sync stream) - gated now to match intent.
  const canManage = user.role === 'owner' || user.role === 'manager';

  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<LocalProductRow[]>([]);
  const [selected, setSelected] = useState<LocalProductRow | null>(null);
  const [stock, setStock] = useState<VariantStock[]>([]);
  const [priceDraft, setPriceDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingProductImage, setUploadingProductImage] = useState(false);

  // Editable variant drafts - loaded from local SQLite (offline-friendly,
  // matches every other read in this app), edited freely, only written
  // back on an explicit "Save variants" (Payload replaces the whole array
  // field on every save, same as web's dialog - no partial-row PATCH).
  const [workingVariants, setWorkingVariants] = useState<WorkingVariant[]>([]);
  const [savingVariants, setSavingVariants] = useState(false);

  // relatedProducts is a Payload relationship field with no local
  // PowerSync stream (see sync-config.yaml - relationship join tables
  // aren't synced), so unlike everything else in this screen it has to be
  // read via REST when a product is opened, not from local SQLite.
  const [relatedIds, setRelatedIds] = useState<number[]>([]);
  const [relatedQuery, setRelatedQuery] = useState('');
  const [savingRelatedId, setSavingRelatedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getDb()
      .getAll<LocalProductRow>(
        `SELECT p.id, p.name, p.sku, p.barcode, p.category, p.cost_price, p.sell_price, p.tax_rate, p.reorder_point, p.is_active, p.image_id, m.url AS image_url,
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
    setRelatedQuery('');
    // _parent_id/product_id are plain replicated INTEGER foreign-key
    // columns (not primary keys), unlike product.id itself (always TEXT
    // locally) - converted here so the comparison actually matches.
    const numericProductId = Number(product.id);
    getDb()
      .getAll<LocalVariantRow>(
        `SELECT pv.id, pv.label, pv.sku, pv.barcode, pv.sell_price, pv.cost_price, pv.image_id, vm.url AS image_url
         FROM products_variants pv LEFT JOIN media vm ON vm.id = pv.image_id
         WHERE pv._parent_id = ? ORDER BY pv._order`,
        [numericProductId],
      )
      .then((rows) =>
        setWorkingVariants(
          rows.map((v) => ({
            id: v.id,
            label: v.label,
            sku: v.sku ?? '',
            barcode: v.barcode ?? '',
            sellPrice: v.sell_price != null ? String(v.sell_price) : '',
            costPrice: v.cost_price != null ? String(v.cost_price) : '',
            imageId: v.image_id,
            imageUrl: v.image_url,
          })),
        ),
      );
    if (storeId != null) {
      getDb()
        .getAll<VariantStock>(
          `SELECT NULL AS variant_id, COALESCE(SUM(quantity_delta), 0) AS quantity FROM stock_movements WHERE product_id = ? AND store_id = ? AND variant IS NULL
           UNION ALL
           SELECT pv.id AS variant_id, COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm WHERE sm.variant = pv.id AND sm.store_id = ?), 0) AS quantity
           FROM products_variants pv WHERE pv._parent_id = ?`,
          [numericProductId, storeId, storeId, numericProductId],
        )
        .then(setStock);
    } else {
      setStock([]);
    }
    // relatedProducts isn't synced locally (see the field's own comment
    // above) - fetched fresh from Payload every time the modal opens.
    fetch(`${API_BASE_URL}/api/products/${product.id}?depth=0`, { headers: { Authorization: `JWT ${payloadToken}` } })
      .then((r) => r.json())
      .then((body) => setRelatedIds(Array.isArray(body?.relatedProducts) ? body.relatedProducts.map(Number) : []))
      .catch(() => setRelatedIds([]));
  }

  function closeModal() {
    setSelected(null);
    setWorkingVariants([]);
    setStock([]);
    setRelatedIds([]);
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
    } catch {
      showAlert('Failed to save', OFFLINE_MESSAGE);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(next: boolean) {
    if (!selected) return;
    try {
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
    } catch {
      showAlert('Failed to save', OFFLINE_MESSAGE);
    }
  }

  // Shared by the product's own image and each variant's - picks from the
  // gallery, uploads straight to Payload's built-in /api/media (same
  // dedicated upload route web's own ImageField posts to), and returns
  // the new media doc's id/url for the caller to store. RN's fetch/
  // FormData accept a {uri, name, type} object as the file part - there is
  // no File/Blob to construct from a picked asset the way a browser has.
  async function pickImage(): Promise<{ id: number; url: string } | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permission needed', 'Allow photo access to set a product image.');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    const formData = new FormData();
    // React Native's FormData accepts this object shape in place of a
    // web File/Blob - confirmed against expo-image-picker's own
    // documented upload pattern.
    formData.append('file', {
      uri: asset.uri,
      name: asset.fileName ?? 'photo.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    } as unknown as Blob);
    try {
      const res = await fetch(`${API_BASE_URL}/api/media`, {
        method: 'POST',
        headers: { Authorization: `JWT ${payloadToken}` },
        body: formData,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        showAlert('Upload failed', body?.errors?.[0]?.message ?? 'Could not upload image');
        return null;
      }
      return { id: body.doc.id, url: body.doc.url };
    } catch {
      showAlert('Upload failed', OFFLINE_MESSAGE);
      return null;
    }
  }

  // The product's own image is a single top-level field, so - like price/
  // active-status above - it saves immediately rather than needing an
  // explicit commit step.
  async function handleProductImage() {
    if (!selected) return;
    setUploadingProductImage(true);
    try {
      const uploaded = await pickImage();
      if (!uploaded) return;
      const res = await fetch(`${API_BASE_URL}/api/products/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
        body: JSON.stringify({ image: uploaded.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showAlert('Failed to save', body?.errors?.[0]?.message ?? 'Could not update image');
        return;
      }
      setProducts((prev) => prev.map((p) => (p.id === selected.id ? { ...p, image_id: uploaded.id, image_url: uploaded.url } : p)));
      setSelected((prev) => (prev ? { ...prev, image_id: uploaded.id, image_url: uploaded.url } : prev));
    } catch {
      showAlert('Failed to save', OFFLINE_MESSAGE);
    } finally {
      setUploadingProductImage(false);
    }
  }

  // Variants are edited as a local draft and only sent on an explicit
  // save - Payload replaces the *whole* array field each time (no partial-
  // row PATCH), so batching every field/row edit into one commit avoids a
  // flood of intermediate network calls the way an instant-save-per-
  // keystroke would.
  function updateVariantField(index: number, field: 'label' | 'sku' | 'barcode' | 'sellPrice' | 'costPrice', value: string) {
    setWorkingVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  }

  async function pickVariantImage(index: number) {
    const uploaded = await pickImage();
    if (!uploaded) return;
    setWorkingVariants((prev) => prev.map((v, i) => (i === index ? { ...v, imageId: uploaded.id, imageUrl: uploaded.url } : v)));
  }

  function addVariant() {
    setWorkingVariants((prev) => [...prev, { id: null, label: '', sku: '', barcode: '', sellPrice: '', costPrice: '', imageId: null, imageUrl: null }]);
  }

  function removeVariant(index: number) {
    setWorkingVariants((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveVariants() {
    if (!selected) return;
    setSavingVariants(true);
    try {
      const payloadVariants = workingVariants
        .filter((v) => v.label.trim())
        .map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          label: v.label.trim(),
          sku: v.sku || undefined,
          barcode: v.barcode || undefined,
          sellPrice: v.sellPrice === '' ? undefined : Number(v.sellPrice),
          costPrice: v.costPrice === '' ? undefined : Number(v.costPrice),
          image: v.imageId,
        }));
      const res = await fetch(`${API_BASE_URL}/api/products/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
        body: JSON.stringify({ variants: payloadVariants }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showAlert('Failed to save', body?.errors?.[0]?.message ?? 'Could not update variants');
        return;
      }
      setProducts((prev) => prev.map((p) => (p.id === selected.id ? { ...p, variant_count: payloadVariants.length } : p)));
      showToast('Variants updated');
    } catch {
      showAlert('Failed to save', OFFLINE_MESSAGE);
    } finally {
      setSavingVariants(false);
    }
  }

  // Related products toggle immediately (no draft/commit step) - adding or
  // removing one entry from a flat id list is a single, low-risk action,
  // same "tap to toggle membership" pattern as a tag picker.
  async function toggleRelated(productId: number) {
    if (!selected) return;
    const next = relatedIds.includes(productId) ? relatedIds.filter((id) => id !== productId) : [...relatedIds, productId];
    setSavingRelatedId(String(productId));
    try {
      const res = await fetch(`${API_BASE_URL}/api/products/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
        body: JSON.stringify({ relatedProducts: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showAlert('Failed to save', body?.errors?.[0]?.message ?? 'Could not update related products');
        return;
      }
      setRelatedIds(next);
    } catch {
      showAlert('Failed to save', OFFLINE_MESSAGE);
    } finally {
      setSavingRelatedId(null);
    }
  }

  const relatedResults = useMemo(() => {
    if (!selected) return [];
    const trimmed = relatedQuery.trim();
    const pool = products.filter((p) => p.id !== selected.id);
    if (!trimmed) return pool.filter((p) => relatedIds.includes(Number(p.id)));
    const fuse = new Fuse(pool, { threshold: 0.4, ignoreLocation: true, keys: ['name', 'sku'] });
    return fuse.search(trimmed).map((r) => r.item);
  }, [relatedQuery, products, selected, relatedIds]);

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
              <View className="flex-row items-center gap-3 rounded-lg border border-border bg-card p-3">
                {selected.image_url ? (
                  <Image source={{ uri: selected.image_url }} className="h-14 w-14 rounded-md bg-muted" resizeMode="cover" />
                ) : (
                  <View className="h-14 w-14 items-center justify-center rounded-md border border-dashed border-border">
                    <Ionicons name="image-outline" size={20} color="#71717a" />
                  </View>
                )}
                <View className="flex-1 gap-1">
                  <Text className="text-xs text-muted-foreground">Product image</Text>
                  <Pressable
                    android_ripple={{ color: '#ffffff40' }}
                    disabled={uploadingProductImage}
                    onPress={handleProductImage}
                    className={`self-start rounded-md border border-border px-3 py-1.5 ${uploadingProductImage ? 'opacity-50' : 'active:opacity-70'}`}
                  >
                    <Text className="text-sm text-foreground">{uploadingProductImage ? 'Uploading...' : selected.image_url ? 'Replace' : 'Upload'}</Text>
                  </Pressable>
                </View>
              </View>

              {!canManage ? (
                <View className="rounded-lg border border-border bg-card p-3">
                  <Text className="text-xs text-muted-foreground">
                    Only owners/managers can edit this product&apos;s details - you can still update its photo (and each variant&apos;s) above and below.
                  </Text>
                </View>
              ) : null}

              <View className="flex-row items-center justify-between rounded-lg border border-border bg-card p-3">
                <View className="shrink pr-3">
                  <Text className="text-foreground">Active</Text>
                  <Text className="text-xs text-muted-foreground">Inactive products are hidden from Sell</Text>
                </View>
                <Switch value={!!selected.is_active} onValueChange={toggleActive} disabled={!canManage} trackColor={{ true: '#df5102' }} />
              </View>

              <View className="gap-2 rounded-lg border border-border bg-card p-3">
                <Text className="text-xs text-muted-foreground">Sell price</Text>
                <View className="flex-row items-center gap-2">
                  <TextInput
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-foreground"
                    keyboardType="decimal-pad"
                    editable={canManage}
                    value={priceDraft}
                    onChangeText={setPriceDraft}
                  />
                  {canManage ? (
                    <Pressable
                      android_ripple={{ color: '#ffffff40' }}
                      disabled={!priceDirty || saving}
                      onPress={savePrice}
                      className={`rounded-md bg-primary px-4 py-2 ${!priceDirty || saving ? 'opacity-50' : 'active:opacity-80'}`}
                    >
                      <Text className="font-medium text-primary-foreground">{saving ? 'Saving...' : 'Save'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View className="flex-row flex-wrap gap-3">
                {canManage ? (
                  <View className="min-w-[45%] flex-1 gap-1 rounded-lg border border-border bg-card p-3">
                    <Text className="text-xs text-muted-foreground">Cost price</Text>
                    <Text className="text-lg font-semibold text-foreground">{selected.cost_price.toFixed(2)}</Text>
                  </View>
                ) : null}
                <View className="min-w-[45%] flex-1 gap-1 rounded-lg border border-border bg-card p-3">
                  <Text className="text-xs text-muted-foreground">Tax rate</Text>
                  <Text className="text-lg font-semibold text-foreground">{(selected.tax_rate * 100).toFixed(0)}%</Text>
                </View>
                {storeId != null && workingVariants.length === 0 ? (
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

              <View className="gap-2 rounded-lg border border-border bg-card p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-medium text-foreground">Variants</Text>
                  {canManage ? (
                    <Pressable android_ripple={{}} onPress={addVariant}>
                      <Text className="text-sm font-medium text-primary">+ Add</Text>
                    </Pressable>
                  ) : null}
                </View>
                {workingVariants.length === 0 ? (
                  <Text className="text-xs text-muted-foreground">No variants - this product is sold as-is.</Text>
                ) : (
                  workingVariants.map((v, index) => {
                    const vStock = v.id ? stock.find((s) => s.variant_id === v.id)?.quantity : undefined;
                    return (
                      <View key={v.id ?? `new-${index}`} className="gap-2 border-b border-border/50 pb-3 pt-1">
                        <View className="flex-row items-center gap-2">
                          <Pressable onPress={() => pickVariantImage(index)}>
                            {v.imageUrl ? (
                              <Image source={{ uri: v.imageUrl }} className="h-10 w-10 rounded-md bg-muted" resizeMode="cover" />
                            ) : (
                              <View className="h-10 w-10 items-center justify-center rounded-md border border-dashed border-border">
                                <Ionicons name="image-outline" size={14} color="#71717a" />
                              </View>
                            )}
                          </Pressable>
                          <TextInput
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                            placeholder="Label (e.g. Red / L)"
                            placeholderTextColor={placeholderColor}
                            editable={canManage}
                            value={v.label}
                            onChangeText={(t) => updateVariantField(index, 'label', t)}
                          />
                          {canManage ? (
                            <Pressable android_ripple={{}} onPress={() => removeVariant(index)}>
                              <Ionicons name="trash-outline" size={18} color="#ef4444" />
                            </Pressable>
                          ) : null}
                        </View>
                        <View className="flex-row gap-2">
                          <TextInput
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                            placeholder="SKU"
                            placeholderTextColor={placeholderColor}
                            editable={canManage}
                            value={v.sku}
                            onChangeText={(t) => updateVariantField(index, 'sku', t)}
                          />
                          <TextInput
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                            placeholder="Barcode"
                            placeholderTextColor={placeholderColor}
                            editable={canManage}
                            value={v.barcode}
                            onChangeText={(t) => updateVariantField(index, 'barcode', t)}
                          />
                        </View>
                        <View className="flex-row gap-2">
                          <TextInput
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                            placeholder="Sell price (blank = inherit)"
                            placeholderTextColor={placeholderColor}
                            keyboardType="decimal-pad"
                            editable={canManage}
                            value={v.sellPrice}
                            onChangeText={(t) => updateVariantField(index, 'sellPrice', t)}
                          />
                          {canManage ? (
                            <TextInput
                              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                              placeholder="Cost price (blank = inherit)"
                              placeholderTextColor={placeholderColor}
                              keyboardType="decimal-pad"
                              value={v.costPrice}
                              onChangeText={(t) => updateVariantField(index, 'costPrice', t)}
                            />
                          ) : null}
                        </View>
                        {storeId != null && vStock != null ? <Text className="text-xs text-muted-foreground">{vStock} in stock</Text> : null}
                      </View>
                    );
                  })
                )}
                <Pressable
                  android_ripple={{ color: '#ffffff40' }}
                  disabled={savingVariants}
                  onPress={saveVariants}
                  className={`mt-1 items-center rounded-md bg-primary py-2 ${savingVariants ? 'opacity-50' : 'active:opacity-80'}`}
                >
                  <Text className="font-medium text-primary-foreground">{savingVariants ? 'Saving...' : 'Save variants'}</Text>
                </Pressable>
              </View>

              <View className="gap-2 rounded-lg border border-border bg-card p-3">
                <Text className="text-sm font-medium text-foreground">Related products</Text>
                <Text className="text-xs text-muted-foreground">Suggested as add-ons on the Sell screen.</Text>
                <TextInput
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  placeholder="Search to add..."
                  placeholderTextColor={placeholderColor}
                  value={relatedQuery}
                  onChangeText={setRelatedQuery}
                />
                {relatedResults.length === 0 ? (
                  <Text className="py-2 text-center text-xs text-muted-foreground">
                    {relatedQuery.trim() ? 'No matches' : 'No related products linked yet'}
                  </Text>
                ) : (
                  relatedResults.map((p) => {
                    const linked = relatedIds.includes(Number(p.id));
                    return (
                      <Pressable
                        key={p.id}
                        android_ripple={{}}
                        disabled={savingRelatedId === p.id || !canManage}
                        onPress={() => toggleRelated(Number(p.id))}
                        className="flex-row items-center justify-between border-b border-border/50 py-2"
                      >
                        <Text className="flex-1 pr-2 text-sm text-foreground" numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Ionicons name={linked ? 'checkmark-circle' : 'add-circle-outline'} size={20} color={linked ? '#df5102' : '#71717a'} />
                      </Pressable>
                    );
                  })
                )}
              </View>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
