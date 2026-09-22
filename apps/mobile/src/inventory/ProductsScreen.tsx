import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Fuse from 'fuse.js';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { View, Text, TextInput, Pressable, FlatList, Image, Modal, Switch, ScrollView, RefreshControl, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useMutedPlaceholderColor } from '../lib/theme';
import { API_BASE_URL, OFFLINE_MESSAGE } from '../lib/auth';
import type { PayloadUser } from '../lib/auth';
import { fetchCatalog, fetchStockLevels, stockKey, stockByKeyMap, type CatalogProduct } from '../lib/catalog';
import { showAlert, showToast } from '../components/AppNotice';
import { usePullToRefresh } from '../lib/usePullToRefresh';

interface LocalProductRow {
  // Kept as a string here (Number(...)'d back out wherever a numeric
  // Payload id is actually needed, e.g. relatedProducts/PATCH targets) -
  // matches this file's pre-existing local type, not a REST-shape
  // requirement (CatalogProduct.id is a plain number).
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

interface VariantStock {
  variant_id: string | null;
  quantity: number;
}

// The mobile catalog browser - takes over the bottom tab's "Inventory" slot
// (stock-level auditing moves into More; see RootTabs.tsx) since checking
// what you sell and at what price is a more frequent need than stock
// auditing. At full editing parity with web's product-dialog.tsx for both
// an *existing* product (image, variants, related-product linking) and
// creating a brand-new one from scratch (canManage-gated "+ New product",
// mirroring web's own create dialog - name/category/price/variants, no
// sku/barcode input since Payload auto-generates both). relatedProducts
// linking still requires an existing product id, so a newly-created
// product gets those added afterwards via the edit modal, same as before.
// Per-store stock stays a simple read + StockAdjustmentModal-style single
// adjustment, not a full editor.
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
  const [workingVariantQuery, setWorkingVariantQuery] = useState('');
  // Per-variant collapse state - a large variant list (40+ rows) is still a
  // lot of scrolling even filtered, since each visible card was previously
  // always fully expanded. Only the indices in this set render their detail
  // fields; everything else shows just a summary row. Newly-added variants
  // are inserted here immediately (see addVariant) so filling one in needs
  // no extra tap, and an active search query treats every visible result as
  // expanded regardless of actual membership (see visibleWorkingVariants'
  // render below).
  const [expandedWorkingVariants, setExpandedWorkingVariants] = useState<Set<number>>(new Set());

  // relatedProducts is a Payload relationship field with no local
  // PowerSync stream (see sync-config.yaml - relationship join tables
  // aren't synced), so unlike everything else in this screen it has to be
  // read via REST when a product is opened, not from local SQLite.
  const [relatedIds, setRelatedIds] = useState<number[]>([]);
  const [relatedQuery, setRelatedQuery] = useState('');
  const [savingRelatedId, setSavingRelatedId] = useState<string | null>(null);

  // Create-from-scratch flow - the one gap this file's own header comment
  // used to call out ("the one thing still web-only is creating a
  // brand-new product"). Entry point is canManage-gated (Products.access.
  // create is managerOrOwner server-side, same as every other field here),
  // so unlike the edit modal above there's no need for per-field canManage
  // checks inside it. sku/barcode are deliberately not collected - Payload
  // auto-generates both via generateProductCodes when left blank, matching
  // web's own create dialog exactly.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('');
  const [newSellPrice, setNewSellPrice] = useState('');
  const [newTaxRate, setNewTaxRate] = useState('');
  const [newMaxDiscount, setNewMaxDiscount] = useState('');
  const [newReorderPoint, setNewReorderPoint] = useState('');
  const [newImage, setNewImage] = useState<{ id: number; url: string } | null>(null);
  const [uploadingNewImage, setUploadingNewImage] = useState(false);
  const [newVariants, setNewVariants] = useState<WorkingVariant[]>([]);
  const [newVariantQuery, setNewVariantQuery] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  // Same collapse treatment as workingVariants above, for the create-from-
  // scratch flow's own variant list.
  const [expandedNewVariants, setExpandedNewVariants] = useState<Set<number>>(new Set());

  const [rawCatalog, setRawCatalog] = useState<CatalogProduct[]>([]);
  const [stockByKey, setStockByKey] = useState<Map<string, number>>(new Map());

  // Whole tenant catalog (every product regardless of active status - this
  // screen is where a product gets toggled active/inactive, so unlike
  // Sell/Restock it must NOT filter is_active out) plus this store's stock
  // levels, fetched together and re-fetched on pull-to-refresh/tab-focus -
  // same "fetch everything" shape as SellScreen's own catalog fetch. Unlike
  // the old reactive PowerSync useQuery, a row here only updates after an
  // explicit refresh - every mutation below (price/active/image/variants/
  // create) calls refresh() itself on success so the list doesn't go stale.
  const refresh = useCallback(async () => {
    const [catalog, levels] = await Promise.all([
      fetchCatalog(payloadToken, tenantId, { activeOnly: false }),
      storeId != null ? fetchStockLevels(payloadToken, storeId) : Promise.resolve([]),
    ]);
    setRawCatalog(catalog);
    setStockByKey(stockByKeyMap(levels));
  }, [payloadToken, tenantId, storeId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  const catalogById = useMemo(() => new Map(rawCatalog.map((p) => [String(p.id), p])), [rawCatalog]);
  const products = useMemo<LocalProductRow[]>(
    () =>
      rawCatalog.map((p) => ({
        id: String(p.id),
        name: p.name,
        sku: p.sku || null,
        barcode: p.barcode,
        category: p.category,
        cost_price: p.costPrice,
        sell_price: p.sellPrice,
        tax_rate: p.taxRate,
        reorder_point: p.reorderPoint,
        is_active: p.isActive ? 1 : 0,
        image_id: p.imageId,
        image_url: p.imageUrl,
        variant_count: p.variants.length,
      })),
    [rawCatalog],
  );

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return products;
    const fuse = new Fuse(products, { threshold: 0.4, ignoreLocation: true, keys: ['name', 'sku', 'barcode', 'category'] });
    return fuse.search(trimmed).map((r) => r.item);
  }, [query, products]);

  // Same fuzzy-search treatment as the product list above, applied to a
  // single product's own variants once there are enough to need it (a
  // paint product can carry 40+ color/size rows) - index-paired so a
  // filtered row still updates the right entry in workingVariants.
  const visibleWorkingVariants = useMemo(() => {
    const indexed = workingVariants.map((v, index) => ({ v, index }));
    const trimmed = workingVariantQuery.trim();
    if (!trimmed) return indexed;
    const fuse = new Fuse(indexed, { threshold: 0.4, ignoreLocation: true, keys: ['v.label', 'v.sku', 'v.barcode'] });
    return fuse.search(trimmed).map((r) => r.item);
  }, [workingVariantQuery, workingVariants]);

  // Same treatment for the create-from-scratch flow's own variant list.
  const visibleNewVariants = useMemo(() => {
    const indexed = newVariants.map((v, index) => ({ v, index }));
    const trimmed = newVariantQuery.trim();
    if (!trimmed) return indexed;
    const fuse = new Fuse(indexed, { threshold: 0.4, ignoreLocation: true, keys: ['v.label', 'v.sku', 'v.barcode'] });
    return fuse.search(trimmed).map((r) => r.item);
  }, [newVariantQuery, newVariants]);

  function openProduct(product: LocalProductRow) {
    setSelected(product);
    setPriceDraft(String(product.sell_price));
    setRelatedQuery('');
    // Variants are already embedded in the fetched catalog's own `variants`
    // array (Payload nests them, no separate query needed).
    const raw = catalogById.get(product.id);
    setWorkingVariants(
      (raw?.variants ?? []).map((v) => ({
        id: v.id,
        label: v.label,
        sku: v.sku,
        barcode: v.barcode ?? '',
        sellPrice: v.sellPrice != null ? String(v.sellPrice) : '',
        costPrice: v.costPrice != null ? String(v.costPrice) : '',
        imageId: v.imageId,
        imageUrl: v.imageUrl,
      })),
    );
    if (storeId != null && raw) {
      const numericProductId = raw.id;
      setStock([
        { variant_id: null, quantity: stockByKey.get(stockKey(numericProductId, null)) ?? 0 },
        ...raw.variants.map((v) => ({ variant_id: v.id, quantity: stockByKey.get(stockKey(numericProductId, v.id)) ?? 0 })),
      ]);
    } else {
      setStock([]);
    }
    // relatedProducts isn't part of the catalog fetch's own shape (it's a
    // plain id-array field, already correctly REST-only before this
    // conversion) - fetched fresh from Payload every time the modal opens.
    fetch(`${API_BASE_URL}/api/products/${product.id}?depth=0`, { headers: { Authorization: `JWT ${payloadToken}` } })
      .then((r) => r.json())
      .then((body) => setRelatedIds(Array.isArray(body?.relatedProducts) ? body.relatedProducts.map(Number) : []))
      .catch(() => setRelatedIds([]));
  }

  function closeModal() {
    setSelected(null);
    setWorkingVariants([]);
    setExpandedWorkingVariants(new Set());
    setWorkingVariantQuery('');
    setStock([]);
    setRelatedIds([]);
  }

  // Writes go straight to Payload over REST, same online-only pattern
  // StaffScreen.tsx/StockAdjustmentModal.tsx already use. `products` is
  // refetched via refresh() on success below so the outer list picks up
  // each change; `selected` (the open detail modal's own state) is also
  // patched directly for instant in-modal feedback ahead of that refetch.
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
      setSelected((prev) => (prev ? { ...prev, sell_price: nextPrice } : prev));
      showToast('Sell price updated');
      refresh();
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
      setSelected((prev) => (prev ? { ...prev, is_active: next ? 1 : 0 } : prev));
      refresh();
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
      setSelected((prev) => (prev ? { ...prev, image_id: uploaded.id, image_url: uploaded.url } : prev));
      refresh();
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

  function toggleWorkingVariantExpanded(index: number) {
    setExpandedWorkingVariants((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function addVariant() {
    setWorkingVariants((prev) => {
      const nextIndex = prev.length;
      setExpandedWorkingVariants((expanded) => new Set(expanded).add(nextIndex));
      return [...prev, { id: null, label: '', sku: '', barcode: '', sellPrice: '', costPrice: '', imageId: null, imageUrl: null }];
    });
  }

  function removeVariant(index: number) {
    setWorkingVariants((prev) => prev.filter((_, i) => i !== index));
    setExpandedWorkingVariants((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
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
      showToast('Variants updated');
      refresh();
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

  function openCreate() {
    setNewName('');
    setNewCategory('');
    setNewCostPrice('');
    setNewSellPrice('');
    setNewTaxRate('');
    setNewMaxDiscount('');
    setNewReorderPoint('');
    setNewImage(null);
    setNewVariants([]);
    setExpandedNewVariants(new Set());
    setNewVariantQuery('');
    setCreating(true);
  }

  function closeCreate() {
    setCreating(false);
  }

  async function handleNewImage() {
    setUploadingNewImage(true);
    try {
      const uploaded = await pickImage();
      if (uploaded) setNewImage(uploaded);
    } finally {
      setUploadingNewImage(false);
    }
  }

  function toggleNewVariantExpanded(index: number) {
    setExpandedNewVariants((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function addNewVariant() {
    setNewVariants((prev) => {
      const nextIndex = prev.length;
      setExpandedNewVariants((expanded) => new Set(expanded).add(nextIndex));
      return [...prev, { id: null, label: '', sku: '', barcode: '', sellPrice: '', costPrice: '', imageId: null, imageUrl: null }];
    });
  }

  function removeNewVariant(index: number) {
    setNewVariants((prev) => prev.filter((_, i) => i !== index));
    setExpandedNewVariants((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
  }

  function updateNewVariantField(index: number, field: 'label' | 'sku' | 'barcode' | 'sellPrice' | 'costPrice', value: string) {
    setNewVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  }

  async function pickNewVariantImage(index: number) {
    const uploaded = await pickImage();
    if (!uploaded) return;
    setNewVariants((prev) => prev.map((v, i) => (i === index ? { ...v, imageId: uploaded.id, imageUrl: uploaded.url } : v)));
  }

  async function createProduct() {
    const name = newName.trim();
    if (!name) {
      showAlert('Name required', 'Enter a product name');
      return;
    }
    setSavingNew(true);
    try {
      const payloadVariants = newVariants
        .filter((v) => v.label.trim())
        .map((v) => ({
          label: v.label.trim(),
          sku: v.sku || undefined,
          barcode: v.barcode || undefined,
          sellPrice: v.sellPrice === '' ? undefined : Number(v.sellPrice),
          costPrice: v.costPrice === '' ? undefined : Number(v.costPrice),
          image: v.imageId ?? undefined,
        }));
      const res = await fetch(`${API_BASE_URL}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
        body: JSON.stringify({
          tenant: tenantId,
          name,
          category: newCategory.trim() || undefined,
          image: newImage?.id,
          costPrice: newCostPrice === '' ? 0 : Number(newCostPrice),
          sellPrice: newSellPrice === '' ? 0 : Number(newSellPrice),
          taxRate: newTaxRate === '' ? 0 : Number(newTaxRate),
          maxDiscountAmount: newMaxDiscount === '' ? 0 : Number(newMaxDiscount),
          reorderPoint: newReorderPoint === '' ? 0 : Number(newReorderPoint),
          variants: payloadVariants,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        showAlert('Failed to create product', body?.errors?.[0]?.message ?? 'Could not create product');
        return;
      }
      // `products` is derived from fetched state, not a live query - refresh
      // explicitly so this new row shows up in the list right away.
      await refresh();
      showToast('Product created');
      closeCreate();
    } catch {
      showAlert('Failed to create product', OFFLINE_MESSAGE);
    } finally {
      setSavingNew(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="border-b border-border p-3">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-2xl font-semibold text-foreground">Products</Text>
          {canManage ? (
            <Pressable android_ripple={{}} onPress={openCreate}>
              <Text className="text-sm font-medium text-primary">+ New product</Text>
            </Pressable>
          ) : null}
        </View>
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
        <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
          <View className="flex-row items-center justify-between border-b border-border px-4 pb-3">
            <Text className="text-lg font-semibold text-foreground" numberOfLines={1}>
              {selected?.name}
            </Text>
            <Pressable android_ripple={{}} onPress={closeModal}>
              <Text className="text-muted-foreground">Close</Text>
            </Pressable>
          </View>
          {selected ? (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
                  <>
                  {workingVariants.length > 6 ? (
                    <TextInput
                      className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                      placeholder="Search variants by name, SKU, or barcode..."
                      placeholderTextColor={placeholderColor}
                      value={workingVariantQuery}
                      onChangeText={setWorkingVariantQuery}
                    />
                  ) : null}
                  {visibleWorkingVariants.length === 0 ? (
                    <Text className="text-xs text-muted-foreground">No variants match &quot;{workingVariantQuery.trim()}&quot;.</Text>
                  ) : (
                  visibleWorkingVariants.map(({ v, index }) => {
                    const vStock = v.id ? stock.find((s) => s.variant_id === v.id)?.quantity : undefined;
                    // While searching, every visible (filtered) result reads
                    // as expanded regardless of the set's actual membership -
                    // search should feel immediate, not require an extra tap
                    // per result.
                    const isExpanded = workingVariantQuery.trim() !== '' || expandedWorkingVariants.has(index);
                    return (
                      <View key={v.id ?? `new-${index}`} className="gap-2 border-b border-border/50 pb-3 pt-1">
                        <Pressable android_ripple={{}} className="flex-row items-center gap-2" onPress={() => toggleWorkingVariantExpanded(index)}>
                          {v.imageUrl ? (
                            <Image source={{ uri: v.imageUrl }} className="h-10 w-10 rounded-md bg-muted" resizeMode="cover" />
                          ) : (
                            <View className="h-10 w-10 items-center justify-center rounded-md border border-dashed border-border">
                              <Ionicons name="image-outline" size={14} color="#71717a" />
                            </View>
                          )}
                          <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                            {v.label || 'Untitled variant'}
                          </Text>
                          {v.sellPrice ? <Text className="text-sm text-muted-foreground">{v.sellPrice}</Text> : null}
                          <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={16} color="#71717a" />
                        </Pressable>
                        {isExpanded ? (
                          <>
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
                          </>
                        ) : null}
                      </View>
                    );
                  })
                  )}
                  </>
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
            </KeyboardAvoidingView>
          ) : null}
        </SafeAreaView>
      </Modal>

      <Modal visible={creating} animationType="slide" onRequestClose={closeCreate}>
        <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
          <View className="flex-row items-center justify-between border-b border-border px-4 pb-3">
            <Text className="text-lg font-semibold text-foreground">New product</Text>
            <Pressable android_ripple={{}} onPress={closeCreate}>
              <Text className="text-muted-foreground">Close</Text>
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerClassName="gap-4 p-4">
            <View className="flex-row items-center gap-3 rounded-lg border border-border bg-card p-3">
              {newImage ? (
                <Image source={{ uri: newImage.url }} className="h-14 w-14 rounded-md bg-muted" resizeMode="cover" />
              ) : (
                <View className="h-14 w-14 items-center justify-center rounded-md border border-dashed border-border">
                  <Ionicons name="image-outline" size={20} color="#71717a" />
                </View>
              )}
              <View className="flex-1 gap-1">
                <Text className="text-xs text-muted-foreground">Product image</Text>
                <Pressable
                  android_ripple={{ color: '#ffffff40' }}
                  disabled={uploadingNewImage}
                  onPress={handleNewImage}
                  className={`self-start rounded-md border border-border px-3 py-1.5 ${uploadingNewImage ? 'opacity-50' : 'active:opacity-70'}`}
                >
                  <Text className="text-sm text-foreground">{uploadingNewImage ? 'Uploading...' : newImage ? 'Replace' : 'Upload'}</Text>
                </Pressable>
              </View>
            </View>

            <View className="gap-2 rounded-lg border border-border bg-card p-3">
              <Text className="text-xs text-muted-foreground">Name</Text>
              <TextInput
                className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
                placeholder="Product name"
                placeholderTextColor={placeholderColor}
                value={newName}
                onChangeText={setNewName}
              />
            </View>

            <View className="gap-2 rounded-lg border border-border bg-card p-3">
              <Text className="text-xs text-muted-foreground">Category</Text>
              <TextInput
                className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
                placeholder="Optional"
                placeholderTextColor={placeholderColor}
                value={newCategory}
                onChangeText={setNewCategory}
              />
            </View>

            <View className="flex-row flex-wrap gap-3">
              <View className="min-w-[45%] flex-1 gap-2 rounded-lg border border-border bg-card p-3">
                <Text className="text-xs text-muted-foreground">Sell price</Text>
                <TextInput
                  className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={placeholderColor}
                  value={newSellPrice}
                  onChangeText={setNewSellPrice}
                />
              </View>
              <View className="min-w-[45%] flex-1 gap-2 rounded-lg border border-border bg-card p-3">
                <Text className="text-xs text-muted-foreground">Cost price</Text>
                <TextInput
                  className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={placeholderColor}
                  value={newCostPrice}
                  onChangeText={setNewCostPrice}
                />
              </View>
              <View className="min-w-[45%] flex-1 gap-2 rounded-lg border border-border bg-card p-3">
                <Text className="text-xs text-muted-foreground">Tax rate (e.g. 0.16 = 16%)</Text>
                <TextInput
                  className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={placeholderColor}
                  value={newTaxRate}
                  onChangeText={setNewTaxRate}
                />
              </View>
              <View className="min-w-[45%] flex-1 gap-2 rounded-lg border border-border bg-card p-3">
                <Text className="text-xs text-muted-foreground">Reorder point</Text>
                <TextInput
                  className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={placeholderColor}
                  value={newReorderPoint}
                  onChangeText={setNewReorderPoint}
                />
              </View>
              <View className="min-w-[45%] flex-1 gap-2 rounded-lg border border-border bg-card p-3">
                <Text className="text-xs text-muted-foreground">Max cashier discount</Text>
                <TextInput
                  className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={placeholderColor}
                  value={newMaxDiscount}
                  onChangeText={setNewMaxDiscount}
                />
              </View>
            </View>

            <View className="gap-2 rounded-lg border border-border bg-card p-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-medium text-foreground">Variants</Text>
                <Pressable android_ripple={{}} onPress={addNewVariant}>
                  <Text className="text-sm font-medium text-primary">+ Add</Text>
                </Pressable>
              </View>
              {newVariants.length === 0 ? (
                <Text className="text-xs text-muted-foreground">No variants - this product will be sold as-is.</Text>
              ) : (
                <>
                {newVariants.length > 6 ? (
                  <TextInput
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    placeholder="Search variants by name, SKU, or barcode..."
                    placeholderTextColor={placeholderColor}
                    value={newVariantQuery}
                    onChangeText={setNewVariantQuery}
                  />
                ) : null}
                {visibleNewVariants.length === 0 ? (
                  <Text className="text-xs text-muted-foreground">No variants match &quot;{newVariantQuery.trim()}&quot;.</Text>
                ) : (
                visibleNewVariants.map(({ v, index }) => {
                  // Same "search implies expanded" rule as the edit flow's
                  // own visibleWorkingVariants rendering above.
                  const isExpanded = newVariantQuery.trim() !== '' || expandedNewVariants.has(index);
                  return (
                  <View key={`new-${index}`} className="gap-2 border-b border-border/50 pb-3 pt-1">
                    <Pressable android_ripple={{}} className="flex-row items-center gap-2" onPress={() => toggleNewVariantExpanded(index)}>
                      {v.imageUrl ? (
                        <Image source={{ uri: v.imageUrl }} className="h-10 w-10 rounded-md bg-muted" resizeMode="cover" />
                      ) : (
                        <View className="h-10 w-10 items-center justify-center rounded-md border border-dashed border-border">
                          <Ionicons name="image-outline" size={14} color="#71717a" />
                        </View>
                      )}
                      <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                        {v.label || 'Untitled variant'}
                      </Text>
                      {v.sellPrice ? <Text className="text-sm text-muted-foreground">{v.sellPrice}</Text> : null}
                      <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={16} color="#71717a" />
                    </Pressable>
                    {isExpanded ? (
                      <>
                        <View className="flex-row items-center gap-2">
                          <Pressable onPress={() => pickNewVariantImage(index)}>
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
                            value={v.label}
                            onChangeText={(t) => updateNewVariantField(index, 'label', t)}
                          />
                          <Pressable android_ripple={{}} onPress={() => removeNewVariant(index)}>
                            <Ionicons name="trash-outline" size={18} color="#ef4444" />
                          </Pressable>
                        </View>
                        <View className="flex-row gap-2">
                          <TextInput
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                            placeholder="SKU (optional)"
                            placeholderTextColor={placeholderColor}
                            value={v.sku}
                            onChangeText={(t) => updateNewVariantField(index, 'sku', t)}
                          />
                          <TextInput
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                            placeholder="Barcode (optional)"
                            placeholderTextColor={placeholderColor}
                            value={v.barcode}
                            onChangeText={(t) => updateNewVariantField(index, 'barcode', t)}
                          />
                        </View>
                        <View className="flex-row gap-2">
                          <TextInput
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                            placeholder="Sell price (blank = inherit)"
                            placeholderTextColor={placeholderColor}
                            keyboardType="decimal-pad"
                            value={v.sellPrice}
                            onChangeText={(t) => updateNewVariantField(index, 'sellPrice', t)}
                          />
                          <TextInput
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                            placeholder="Cost price (blank = inherit)"
                            placeholderTextColor={placeholderColor}
                            keyboardType="decimal-pad"
                            value={v.costPrice}
                            onChangeText={(t) => updateNewVariantField(index, 'costPrice', t)}
                          />
                        </View>
                      </>
                    ) : null}
                  </View>
                  );
                })
                )}
                </>
              )}
            </View>

            <Pressable
              android_ripple={{ color: '#ffffff40' }}
              disabled={savingNew || !newName.trim()}
              onPress={createProduct}
              className={`items-center rounded-md bg-primary py-3 ${savingNew || !newName.trim() ? 'opacity-50' : 'active:opacity-80'}`}
            >
              <Text className="font-medium text-primary-foreground">{savingNew ? 'Creating...' : 'Create product'}</Text>
            </Pressable>
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
