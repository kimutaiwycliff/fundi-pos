import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Fuse from 'fuse.js';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useMutedPlaceholderColor } from '../lib/theme';
import { View, Text, TextInput, Pressable, FlatList, Image, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { showAlert, showToast } from '../components/AppNotice';
import { computeOrderTotals, type LineInput } from '@hardware-pos/business-logic';
import { API_BASE_URL, apiFetch } from '../lib/auth';
import { fetchCatalog, fetchStockLevels, stockKey as apiStockKey, stockByKeyMap, type CatalogProduct } from '../lib/catalog';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { deleteHeldSale, holdSale, listHeldSales, type HeldSale } from '../db/heldSales';
import { findOpenShift, type Shift } from '../lib/shifts';
import { uuid } from '../lib/uuid';
import { QuantityField } from '../components/QuantityField';
import { NetworkStatusPill } from '../components/NetworkStatusPill';
import type { PayloadUser } from '../lib/auth';
import { ShiftWidget } from './ShiftWidget';
import { CustomerPicker, type LocalCustomer } from './CustomerPicker';
import { VariantPickerModal } from './VariantPickerModal';
import { HeldSalesModal } from './HeldSalesModal';
import {
  stockKey,
  lineUnitPrice,
  lineDisplayLabel,
  maxDiscountAmountForLine,
  type CartLine,
  type LocalProduct,
  type LocalVariant,
  type TenderType,
} from './types';

// Ported from apps/desktop/src/Till.tsx + apps/web/.../sell/sell-client.tsx,
// now fully online: the catalog is a plain REST fetch (Payload's own
// /api/products, same as apps/web's dashboard/sell/page.tsx) rather than a
// PowerSync-synced local table, and completeSale below is a synchronous
// POST to /api/sync/orders rather than a local SQLite write - there is no
// offline capability left in this screen at all (see App.tsx/db removal
// this shipped alongside). Stock is decremented server-side, automatically,
// as part of that same order-creation call (Orders.ts's afterChange hook
// posts the resulting stock_movements rows itself) - nothing here writes to
// stock_movements directly any more.
const TENDER_OPTIONS: Array<{ value: TenderType; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'credit', label: 'Credit' },
];

interface OrderHistoryRow {
  id: string;
  lineItems: Array<{ product: number }>;
}

interface TenantFlags {
  shiftsRequired: boolean;
  enforceDiscountCaps: boolean;
}

function lineKey(line: Pick<CartLine, 'product' | 'variant'>): string {
  return stockKey(line.product.id, line.variant?.id ?? null);
}

function lineStock(line: Pick<CartLine, 'product' | 'variant'>): number {
  return line.variant ? line.variant.stock_on_hand : line.product.stock_on_hand;
}

function toLocalProduct(p: CatalogProduct, stockByKey: Map<string, number>): LocalProduct {
  return {
    id: String(p.id),
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    sell_price: p.sellPrice,
    tax_rate: p.taxRate,
    max_discount_amount: p.maxDiscountAmount,
    stock_on_hand: stockByKey.get(apiStockKey(p.id, null)) ?? 0,
    variant_count: p.variants.length,
    image_url: p.imageUrl,
  };
}

function toLocalVariants(p: CatalogProduct, stockByKey: Map<string, number>): LocalVariant[] {
  return p.variants.map((v) => ({
    id: v.id,
    label: v.label,
    sku: v.sku,
    barcode: v.barcode,
    sell_price: v.sellPrice,
    stock_on_hand: stockByKey.get(apiStockKey(p.id, v.id)) ?? 0,
    image_url: v.imageUrl,
  }));
}

export function SellScreen({
  user,
  payloadToken,
  terminalId,
  terminalName,
  storeId,
}: {
  user: PayloadUser;
  payloadToken: string;
  terminalId: string;
  terminalName: string;
  storeId: number | null;
}) {
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
  const placeholderColor = useMutedPlaceholderColor();

  const [query, setQuery] = useState('');
  const [rawCatalog, setRawCatalog] = useState<CatalogProduct[]>([]);
  const [stockByKey, setStockByKey] = useState<Map<string, number>>(new Map());
  const [orderHistory, setOrderHistory] = useState<OrderHistoryRow[]>([]);
  const [tenantFlags, setTenantFlags] = useState<TenantFlags>({ shiftsRequired: true, enforceDiscountCaps: true });
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tenderType, setTenderType] = useState<TenderType>('cash');
  const [selectedCustomer, setSelectedCustomer] = useState<LocalCustomer | null>(null);
  const [completing, setCompleting] = useState(false);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [heldSalesOpen, setHeldSalesOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [variantPickerProduct, setVariantPickerProduct] = useState<LocalProduct | null>(null);

  async function refreshHeldSales() {
    setHeldSales(await listHeldSales());
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshHeldSales();
  }, []);

  useEffect(() => {
    if (storeId == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveShift(null);
      return;
    }
    let cancelled = false;
    findOpenShift(payloadToken, terminalId, user.id).then((shift) => {
      if (!cancelled) setActiveShift(shift);
    });
    return () => {
      cancelled = true;
    };
  }, [storeId, terminalId, user.id, payloadToken]);

  // A cart built against one store's stock/prices can't carry over to
  // another - cleared on every branch switch, matching desktop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCart([]);
    setSelectedCustomer(null);
    setQuery('');
  }, [storeId]);

  // Whole active catalog for this tenant plus this store's stock levels,
  // fetched together and re-fetched on pull-to-refresh/tab-focus - same
  // "fetch everything, filter in memory" shape as apps/web's own
  // dashboard/sell/page.tsx + product-search.tsx. orderHistory backs both
  // the idle "recently sold" grid and the "frequently bought together"
  // cross-sell strip below, computed client-side from the same recent-order
  // window rather than two separate SQL aggregate queries.
  const refresh = useCallback(async () => {
    const [catalog, levels, tenant] = await Promise.all([
      fetchCatalog(payloadToken, tenantId),
      storeId != null ? fetchStockLevels(payloadToken, storeId) : Promise.resolve([]),
      fetch(`${API_BASE_URL}/api/tenants/${tenantId}`, { headers: { Authorization: `JWT ${payloadToken}` } })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    setRawCatalog(catalog);
    setStockByKey(stockByKeyMap(levels));
    if (tenant) {
      setTenantFlags({
        shiftsRequired: tenant.shiftsRequired !== false,
        enforceDiscountCaps: tenant.enforceDiscountCaps !== false,
      });
    }
    if (storeId != null) {
      const res = await fetch(
        `${API_BASE_URL}/api/orders?where[store][equals]=${storeId}&where[status][equals]=completed&sort=-createdAt&limit=300&depth=0`,
        { headers: { Authorization: `JWT ${payloadToken}` } },
      ).catch(() => null);
      const body = res && res.ok ? await res.json().catch(() => null) : null;
      setOrderHistory(body?.docs ?? []);
    } else {
      setOrderHistory([]);
    }
  }, [payloadToken, tenantId, storeId]);

  // useFocusEffect alone covers both the initial mount (a newly-mounted
  // screen that's part of the initial route is immediately focused) and
  // every subsequent return to this tab - a separate plain useEffect
  // calling the same refresh() would be redundant, matching how
  // CustomersScreen.tsx/SalesScreen.tsx already only use this one hook.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  const catalogById = useMemo(() => new Map(rawCatalog.map((p) => [String(p.id), p])), [rawCatalog]);
  const catalog = useMemo(() => rawCatalog.map((p) => toLocalProduct(p, stockByKey)), [rawCatalog, stockByKey]);

  const shiftsRequired = tenantFlags.shiftsRequired;
  const enforceDiscountCaps = tenantFlags.enforceDiscountCaps;
  // Owners always bypass the per-product discount cap regardless of the
  // toggle; everyone else bypasses it only when the tenant has turned
  // enforcement off entirely (matches Orders.ts's own
  // `!isOwner && enforceCaps` server-side gate).
  const isOwner = user.role === 'owner';
  const discountCapBypassed = isOwner || !enforceDiscountCaps;

  // The per-product cap (maxDiscountAmountForLine) only applies while the
  // cap is actually being enforced for this cashier. Bypassed, the only
  // limit left is a basic sanity bound - a discount can't exceed the line's
  // own subtotal (i.e. can't push the line negative) - deliberately not
  // tied to the product's configured cap at all.
  function maxDiscountForLine(line: Pick<CartLine, 'product' | 'variant'>, quantity: number): number {
    if (discountCapBypassed) {
      return quantity * lineUnitPrice(line);
    }
    return maxDiscountAmountForLine({ quantity, product: line.product });
  }

  // Idle-state default is this store's recently sold products, ordered by
  // most recent sale first - orderHistory is already sorted -createdAt, so
  // a simple first-seen-wins scan over it reproduces the same ordering the
  // old `ORDER BY last_sold DESC` SQL query produced.
  const recentProductIds = useMemo(() => {
    const seen = new Set<number>();
    const ids: number[] = [];
    for (const order of orderHistory) {
      for (const li of order.lineItems ?? []) {
        if (!seen.has(li.product)) {
          seen.add(li.product);
          ids.push(li.product);
        }
      }
      if (ids.length >= 30) break;
    }
    return ids.slice(0, 30);
  }, [orderHistory]);

  // "Frequently bought with" - cross-sell suggestions computed from this
  // store's own recent order history: which other products have shown up in
  // the SAME order as anything currently in the cart, most-co-occurring
  // first. Recomputed whenever the cart's set of distinct products changes.
  const cartProductIds = useMemo(() => [...new Set(cart.map((l) => Number(l.product.id)))].sort((a, b) => a - b), [cart]);
  const cartProductIdsKey = cartProductIds.join(',');

  const frequentlyBoughtIds = useMemo(() => {
    if (cartProductIds.length === 0) return [];
    const cartSet = new Set(cartProductIds);
    const counts = new Map<number, number>();
    for (const order of orderHistory) {
      const idsInOrder = new Set((order.lineItems ?? []).map((li) => li.product));
      if (!cartProductIds.some((id) => idsInOrder.has(id))) continue;
      for (const id of idsInOrder) {
        if (cartSet.has(id)) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([id]) => id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderHistory, cartProductIdsKey]);

  // Barcode scanners are plain HID keyboard input, same as desktop/web -
  // typing into a focused search box already handles a scan with no
  // special-case code. A scanned barcode is exact digits typed fast with no
  // chance for a human to double-check, so an exact hit always short-
  // circuits past the fuzzy pass below - fuzzy-matching it could ring up a
  // close-but-wrong product. Free-text name/SKU typos are what the fuzzy
  // pass is actually for, and carry no such risk (same reasoning as
  // apps/web/src/app/dashboard/sell/product-search.tsx).
  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const lower = trimmed.toLowerCase();
    const exactBarcodeMatch = catalog.find((p) => p.barcode && p.barcode.toLowerCase() === lower);
    if (exactBarcodeMatch) return [exactBarcodeMatch];
    const fuse = new Fuse(catalog, { threshold: 0.4, ignoreLocation: true, keys: ['name', 'sku'] });
    return fuse.search(trimmed).slice(0, 20).map((r) => r.item);
  }, [query, catalog]);

  const recentProducts = useMemo(() => {
    const byId = new Map(catalog.map((p) => [Number(p.id), p]));
    return recentProductIds.map((id) => byId.get(id)).filter((p): p is LocalProduct => p != null);
  }, [catalog, recentProductIds]);

  const frequentlyBoughtProducts = useMemo(() => {
    const byId = new Map(catalog.map((p) => [Number(p.id), p]));
    return frequentlyBoughtIds.map((id) => byId.get(id)).filter((p): p is LocalProduct => p != null);
  }, [catalog, frequentlyBoughtIds]);

  // Idle state shows only recently sold products (search still covers the
  // full catalog) - deliberately empty rather than falling back to the
  // full catalog for a store with no sales history yet, per instruction.
  // Once something's in the cart, cross-sell suggestions take priority
  // over plain recency - "what goes with this" is more useful mid-sale
  // than "what sold recently", and falls back to recents when there's no
  // co-occurrence history yet for what's in the cart.
  const displayedProducts = query.trim() ? results : frequentlyBoughtProducts.length > 0 ? frequentlyBoughtProducts : recentProducts;
  const showingFrequentlyBought = !query.trim() && frequentlyBoughtProducts.length > 0;

  const lineInputs: LineInput[] = useMemo(
    () =>
      cart.map((line) => ({
        quantity: line.quantity,
        unitPrice: lineUnitPrice(line),
        discount: line.discountAmount,
        taxRate: line.product.tax_rate,
      })),
    [cart],
  );
  const totals = useMemo(() => computeOrderTotals(lineInputs), [lineInputs]);

  // Variants for whichever product the picker currently has open - looked
  // up from the already-fetched catalog (which already carries each
  // product's nested `variants` array from Payload, per-store stock
  // resolved against the same stockByKey map used everywhere else on this
  // screen) rather than a separate network round trip.
  const variantPickerOptions = useMemo(() => {
    if (!variantPickerProduct) return [];
    const raw = catalogById.get(variantPickerProduct.id);
    return raw ? toLocalVariants(raw, stockByKey) : [];
  }, [variantPickerProduct, catalogById, stockByKey]);

  function requestAdd(product: LocalProduct) {
    if (product.variant_count > 0) {
      setVariantPickerProduct(product);
    } else {
      addToCart(product, null);
    }
  }

  function addToCart(product: LocalProduct, variant: LocalVariant | null) {
    const stock = variant ? variant.stock_on_hand : product.stock_on_hand;
    const key = stockKey(product.id, variant?.id ?? null);
    const existing = cart.find((l) => lineKey(l) === key);
    const nextQuantity = (existing?.quantity ?? 0) + 1;
    const label = variant ? `${product.name} — ${variant.label}` : product.name;
    if (nextQuantity > stock) {
      showAlert('Out of stock', `Only ${stock} ${label} left in stock`);
      return;
    }
    setCart((prev) =>
      existing
        ? prev.map((l) => (lineKey(l) === key ? { ...l, quantity: l.quantity + 1 } : l))
        : [...prev, { product, variant, quantity: 1, discountAmount: 0 }],
    );
    // A quick confirmation pulse per successful add - lets a cashier scan a
    // whole basket of items without having to visually check the screen
    // after each one, same reasoning as every other tactile confirmation
    // already in this app (PinPad, staff toggles).
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setQuery('');
    setVariantPickerProduct(null);
  }

  function updateQuantity(line: CartLine, quantity: number) {
    const stock = lineStock(line);
    if (quantity > line.quantity && quantity > stock) {
      showAlert('Out of stock', `Only ${stock} ${lineDisplayLabel(line)} left in stock`);
      return;
    }
    const key = lineKey(line);
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((l) => lineKey(l) !== key)
        : prev.map((l) => {
            if (lineKey(l) !== key) return l;
            const max = maxDiscountForLine(l, quantity);
            return { ...l, quantity, discountAmount: Math.min(l.discountAmount, max) };
          }),
    );
  }

  function updateDiscountAmount(line: CartLine, rawValue: number) {
    const max = maxDiscountForLine(line, line.quantity);
    const clamped = Math.min(Math.max(rawValue, 0), max);
    // The "too high" hint is tied to the product's own configured cap - it
    // doesn't apply once that cap is bypassed (owner, or the toggle off),
    // even though the sanity-bound clamp above still silently protects
    // against a negative line.
    if (!discountCapBypassed && rawValue > max) {
      showAlert('Discount too high', `Max discount for ${lineDisplayLabel(line)} is ${max.toFixed(2)}`);
    }
    const key = lineKey(line);
    setCart((prev) => prev.map((l) => (lineKey(l) === key ? { ...l, discountAmount: clamped } : l)));
  }

  async function handleHoldSale() {
    if (cart.length === 0) return;
    await holdSale(JSON.stringify(cart));
    setCart([]);
    setSelectedCustomer(null);
    await refreshHeldSales();
    setCartOpen(false);
  }

  async function handleResumeSale(held: HeldSale) {
    setCart(JSON.parse(held.cartJson) as CartLine[]);
    await deleteHeldSale(held.id);
    await refreshHeldSales();
  }

  // Synchronous REST checkout: POST /api/sync/orders (the same idempotent-
  // on-duplicate-id ingestion endpoint the old upload queue used, reused
  // here as a live call rather than switched to a different route - the
  // idempotency is worth keeping as protection against a double-tap or a
  // timeout-then-retry). On success, clears the cart and shows the receipt
  // toast, same as before. On failure - apiFetch throwing (no connectivity)
  // or a non-2xx response - the cart is deliberately left untouched so the
  // cashier can retry once reconnected without re-entering everything.
  async function completeSale() {
    if (cart.length === 0 || storeId == null || tenantId == null) return;
    if (shiftsRequired && activeShift == null) {
      showAlert('Open a shift before completing a sale');
      return;
    }
    if (tenderType === 'credit' && !selectedCustomer) {
      showAlert('Select a customer for a credit sale');
      return;
    }
    const oversold = cart.find((line) => line.quantity > lineStock(line));
    if (oversold) {
      showAlert('Out of stock', `Only ${lineStock(oversold)} ${lineDisplayLabel(oversold)} left in stock`);
      return;
    }

    setCompleting(true);
    const orderId = uuid();
    const paymentStatus = tenderType === 'credit' ? 'pending' : 'paid';
    const body = {
      id: orderId,
      tenant: tenantId,
      store: storeId,
      terminal: terminalId,
      terminalName: terminalName,
      cashier: user.id,
      customer: selectedCustomer ? Number(selectedCustomer.id) : null,
      lineItems: cart.map((line) => ({
        product: Number(line.product.id),
        variant: line.variant?.id ?? null,
        quantity: line.quantity,
        unitPrice: lineUnitPrice(line),
        discount: line.discountAmount,
      })),
      taxTotal: totals.taxTotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
      tenderType,
      paymentStatus,
      status: 'completed',
      createdOffline: false,
    };

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/sync/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        showAlert('Could not complete sale', errBody?.errors?.[0]?.message ?? errBody?.error ?? `Request failed (HTTP ${res.status})`);
        return;
      }
      const tenderLabel = TENDER_OPTIONS.find((t) => t.value === tenderType)?.label ?? tenderType;
      showToast(`Sale completed · ${tenderLabel} · ${totals.total.toFixed(2)}`);
      setCart([]);
      setSelectedCustomer(null);
      setCartOpen(false);
      refresh();
    } catch (err) {
      // apiFetch turns a connectivity-layer failure into Error(OFFLINE_MESSAGE)
      // - the cart is intentionally NOT cleared here, so a cashier can retry
      // once reconnected without re-entering the whole sale.
      showAlert('Could not complete sale', err instanceof Error ? err.message : String(err));
    } finally {
      setCompleting(false);
    }
  }

  const trimmedQuery = query.trim();
  const checkoutDisabled =
    cart.length === 0 || completing || (shiftsRequired && activeShift == null) || (tenderType === 'credit' && !selectedCustomer);
  const checkoutLabel = completing
    ? 'Completing...'
    : shiftsRequired && activeShift == null
      ? 'Open a shift to sell'
      : tenderType === 'credit' && !selectedCustomer
        ? 'Select a customer'
        : 'Complete sale';

  if (storeId == null) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-lg font-semibold text-foreground">Select a branch to start selling</Text>
        <Text className="mt-1 text-center text-muted-foreground">Use the branch switcher in More to pick a store.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <View className="gap-2 border-b border-border p-3">
          <View className="flex-row items-center justify-between">
            {shiftsRequired || activeShift != null ? (
              <ShiftWidget
                payloadToken={payloadToken}
                tenantId={tenantId}
                storeId={storeId}
                terminal={terminalId}
                cashierId={user.id}
                shift={activeShift}
                onShiftChange={setActiveShift}
              />
            ) : (
              <NetworkStatusPill />
            )}
            <Pressable android_ripple={{}} className="ml-2 rounded-md border border-border px-3 py-1.5 active:opacity-70" onPress={() => setHeldSalesOpen(true)}>
              <Text className="text-sm text-foreground">
                Held{heldSales.length > 0 ? ` (${heldSales.length})` : ''}
              </Text>
            </Pressable>
          </View>
          <TextInput
            autoFocus
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
            placeholder="Scan barcode or search by name/SKU..."
            placeholderTextColor={placeholderColor}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Idle center area shows recently sold products so there's
            something tappable without typing/scanning first - search
            still covers the full catalog regardless. */}
        {displayedProducts.length > 0 ? (
          <FlatList
            className="flex-1"
            contentContainerClassName="gap-2 p-3 pb-24"
            data={displayedProducts}
            keyExtractor={(p) => p.id}
            numColumns={2}
            columnWrapperClassName="gap-2"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#df5102" />}
            ListHeaderComponent={
              !trimmedQuery ? (
                <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {showingFrequentlyBought ? 'Frequently bought together' : 'Recently sold'}
                </Text>
              ) : null
            }
            renderItem={({ item }) => {
              const outOfStock = item.variant_count === 0 && item.stock_on_hand <= 0;
              return (
                <Animated.View entering={FadeInDown.duration(200)} className="flex-1">
                <Pressable android_ripple={{}}
                  className={`overflow-hidden rounded-lg border border-border bg-card p-3 ${outOfStock ? 'opacity-50' : 'active:opacity-70'}`}
                  disabled={outOfStock}
                  onPress={() => requestAdd(item)}
                >
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} className="mb-2 h-20 w-full rounded-md bg-muted" resizeMode="cover" />
                  ) : (
                    <View className="mb-2 h-20 w-full items-center justify-center rounded-md bg-muted">
                      <Ionicons name="image-outline" size={22} color="#71717a" />
                    </View>
                  )}
                  <Text className="font-medium text-foreground" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                    {item.sku}
                  </Text>
                  <View className="mt-2 flex-row items-center justify-between">
                    <Text className="font-semibold text-foreground">{item.sell_price.toFixed(2)}</Text>
                    <Text className={outOfStock ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                      {item.variant_count > 0 ? `${item.variant_count} options` : outOfStock ? 'Out of stock' : `${item.stock_on_hand} in stock`}
                    </Text>
                  </View>
                </Pressable>
                </Animated.View>
              );
            }}
          />
        ) : (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center font-medium text-foreground">
              {trimmedQuery ? `No products match "${trimmedQuery}"` : catalog.length === 0 ? 'No products found' : 'No sales yet at this store'}
            </Text>
            <Text className="mt-1 text-center text-muted-foreground">
              {trimmedQuery
                ? 'Try a different name, SKU, or scan the barcode directly.'
                : catalog.length === 0
                  ? 'Pull down to refresh once products have been added.'
                  : 'Scan a barcode or start typing to add a product to the sale.'}
            </Text>
          </View>
        )}

        {/* Collapsed summary bar - tap to expand the sale in place below,
            never navigating off this screen. */}
        <Pressable android_ripple={{}} className="border-t border-border bg-card px-4 py-3 active:opacity-80" onPress={() => setCartOpen((open) => !open)}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Ionicons name={cartOpen ? 'chevron-down' : 'chevron-up'} size={16} color="#71717a" />
              <Text className="font-medium text-foreground">
                {cart.length} item{cart.length === 1 ? '' : 's'}
              </Text>
            </View>
            <Text className="font-semibold text-foreground">{totals.total.toFixed(2)}</Text>
          </View>
        </Pressable>

        {/* Expanded sale sheet - an in-page overlay (not a full-screen Modal)
            so completing a sale is reachable without leaving the product
            grid; the top slice of the grid stays visible/tappable above it,
            so a cashier can keep adding items while reviewing the cart. */}
        {cartOpen ? (
          <Animated.View
            entering={SlideInDown.duration(220)}
            exiting={SlideOutDown.duration(180)}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78%' }}
            className="rounded-t-2xl border-t border-border bg-background"
          >
            <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <Text className="text-lg font-semibold text-foreground">Current sale</Text>
              <Pressable android_ripple={{}} onPress={() => setCartOpen(false)}>
                <Text className="text-muted-foreground">Close</Text>
              </Pressable>
            </View>

            {cart.length === 0 ? (
              <View className="items-center justify-center px-6 py-10">
                <Text className="text-center text-muted-foreground">Cart is empty - search or scan a product to get started.</Text>
              </View>
            ) : (
              <FlatList
                // Concrete pixel cap for the same reason as SalesScreen's
                // receipt FlatList: this sheet is only maxHeight-bound, not
                // itself a definite size, so a flex-grow (or unsized) child
                // here is the same ambiguous Yoga case that can measure to
                // zero height and render nothing.
                style={{ maxHeight: 240 }}
                contentContainerClassName="gap-2 p-4"
                data={cart}
                keyExtractor={(l) => lineKey(l)}
                renderItem={({ item }) => {
                  const max = maxDiscountForLine(item, item.quantity);
                  const price = lineUnitPrice(item);
                  return (
                    <Animated.View entering={FadeInDown.duration(180)} className="rounded-lg border border-border p-3">
                      <View className="flex-row items-center justify-between">
                        <View className="shrink">
                          <Text className="font-medium text-foreground">{lineDisplayLabel(item)}</Text>
                          <Text className="text-xs text-muted-foreground">{price.toFixed(2)} each</Text>
                        </View>
                        <View className="flex-row items-center gap-3">
                          <Pressable android_ripple={{}} className="h-8 w-8 items-center justify-center rounded-md border border-border" onPress={() => updateQuantity(item, item.quantity - 1)}>
                            <Text className="text-foreground">−</Text>
                          </Pressable>
                          <QuantityField quantity={item.quantity} onChange={(next) => updateQuantity(item, next)} />
                          <Pressable android_ripple={{}} className="h-8 w-8 items-center justify-center rounded-md border border-border" onPress={() => updateQuantity(item, item.quantity + 1)}>
                            <Text className="text-foreground">+</Text>
                          </Pressable>
                        </View>
                      </View>
                      <Text className="mt-1 text-right font-semibold text-foreground">{(item.quantity * price - item.discountAmount).toFixed(2)}</Text>
                      {max > 0 ? (
                        <View className="mt-2 flex-row items-center gap-2">
                          <Text className="text-xs text-muted-foreground">Discount</Text>
                          <TextInput
                            className="h-8 w-24 rounded-md border border-border bg-card px-2 text-sm text-foreground"
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            placeholderTextColor={placeholderColor}
                            value={item.discountAmount === 0 ? '' : String(item.discountAmount)}
                            onChangeText={(text) => updateDiscountAmount(item, Number(text) || 0)}
                          />
                          {!discountCapBypassed ? <Text className="text-xs text-muted-foreground">(max {max.toFixed(2)})</Text> : null}
                        </View>
                      ) : null}
                    </Animated.View>
                  );
                }}
              />
            )}

            <View className="gap-3 border-t border-border p-4">
              <View className="gap-1">
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground">Tax</Text>
                  <Text className="text-foreground">{totals.taxTotal.toFixed(2)}</Text>
                </View>
                {totals.discountTotal > 0 ? (
                  <View className="flex-row justify-between">
                    <Text className="text-muted-foreground">Discount</Text>
                    <Text className="text-foreground">-{totals.discountTotal.toFixed(2)}</Text>
                  </View>
                ) : null}
                <View className="flex-row justify-between">
                  <Text className="font-semibold text-foreground">Total</Text>
                  <Text className="font-semibold text-foreground">{totals.total.toFixed(2)}</Text>
                </View>
              </View>

              <View className="flex-row gap-1.5">
                {TENDER_OPTIONS.map((option) => (
                  <Pressable android_ripple={{ color: '#ffffff40' }}
                    key={option.value}
                    className={`flex-1 items-center rounded-md border py-2 ${tenderType === option.value ? 'border-primary bg-primary' : 'border-border'}`}
                    onPress={() => setTenderType(option.value)}
                  >
                    <Text className={tenderType === option.value ? 'font-medium text-primary-foreground' : 'text-foreground'}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>

              {tenderType === 'credit' ? (
                <CustomerPicker payloadToken={payloadToken} tenantId={tenantId} value={selectedCustomer} onChange={setSelectedCustomer} />
              ) : null}

              <Pressable android_ripple={{ color: '#ffffff40' }}
                className={`items-center rounded-lg bg-primary py-3 ${checkoutDisabled ? 'opacity-50' : 'active:opacity-80'}`}
                disabled={checkoutDisabled}
                onPress={completeSale}
              >
                <Text className="font-medium text-primary-foreground">{checkoutLabel}</Text>
              </Pressable>
              <Pressable android_ripple={{}}
                className={`items-center rounded-lg border border-border py-3 ${cart.length === 0 ? 'opacity-50' : 'active:opacity-70'}`}
                disabled={cart.length === 0}
                onPress={handleHoldSale}
              >
                <Text className="font-medium text-foreground">Hold sale</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : null}

      <VariantPickerModal
        product={variantPickerProduct}
        variants={variantPickerOptions}
        onSelect={(variant) => variantPickerProduct && addToCart(variantPickerProduct, variant)}
        onClose={() => setVariantPickerProduct(null)}
      />

      <HeldSalesModal visible={heldSalesOpen} heldSales={heldSales} onResume={handleResumeSale} onClose={() => setHeldSalesOpen(false)} />
        </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
