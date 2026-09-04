import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useMutedPlaceholderColor } from '../lib/theme';
import { View, Text, TextInput, Pressable, FlatList, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { showAlert, showToast } from '../components/AppNotice';
import { computeOrderTotals, type LineInput } from '@hardware-pos/business-logic';
import { getDb } from '../db/database';
import { deleteHeldSale, holdSale, listHeldSales, type HeldSale } from '../db/heldSales';
import { findOpenShift, type Shift } from '../lib/shifts';
import { uuid } from '../lib/uuid';
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

// Ported from apps/desktop/src/Till.tsx + apps/web/.../sell/sell-client.tsx
// (the more current reference - it already has variant selling and the
// per-unit discount-cap model desktop's Till.tsx hasn't been updated to
// yet), combined with desktop's offline-first checkout: the order is
// written directly into the local synced tables inside one transaction,
// never a server round-trip at sale time. Stock is deliberately NOT
// decremented here - stock_movements is server-authoritative and only
// arrives once this order syncs up and the resulting ledger rows sync back
// down (see schema.ts's own note on this).
const TENDER_OPTIONS: Array<{ value: TenderType; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'credit', label: 'Credit' },
];

function lineKey(line: Pick<CartLine, 'product' | 'variant'>): string {
  return stockKey(line.product.id, line.variant?.id ?? null);
}

function lineStock(line: Pick<CartLine, 'product' | 'variant'>): number {
  return line.variant ? line.variant.stock_on_hand : line.product.stock_on_hand;
}

// Tap the quantity number to type an exact amount, rather than tapping +/−
// one unit at a time - a real gap for a hardware/electrical shop selling
// 20-50 units of a small item. Needs its own local draft state (a plain
// FlatList renderItem callback can't hold hooks), synced back to the real
// quantity whenever it changes from elsewhere (the +/− steppers), and only
// committed on blur/submit - never on every keystroke, since a briefly-
// cleared field would otherwise call onChange(0), which updateQuantity
// treats as "remove this line".
function QuantityField({ quantity, onChange }: { quantity: number; onChange: (next: number) => void }) {
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(String(quantity));
  }, [quantity]);

  function commit() {
    const next = Number(draft);
    if (Number.isFinite(next) && next > 0 && next !== quantity) {
      onChange(next);
    } else {
      setDraft(String(quantity));
    }
  }

  return (
    <TextInput
      className="w-12 text-center text-foreground"
      keyboardType="number-pad"
      value={draft}
      onChangeText={setDraft}
      onEndEditing={commit}
      onSubmitEditing={commit}
      selectTextOnFocus
    />
  );
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
  const [catalog, setCatalog] = useState<LocalProduct[]>([]);
  const [recentProductIds, setRecentProductIds] = useState<number[]>([]);
  const [frequentlyBoughtIds, setFrequentlyBoughtIds] = useState<number[]>([]);
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
    setCatalog([]);
  }, [storeId]);

  // Whole active catalog for this store, loaded once (not per keystroke) so
  // search can fuzzy-match client-side - same "fetch everything, filter in
  // memory" shape as apps/web's dashboard/sell/page.tsx + product-search.tsx,
  // just against local SQLite instead of a Payload REST fetch.
  useEffect(() => {
    if (storeId == null) return;
    let active = true;
    getDb()
      .getAll<LocalProduct>(
        `SELECT p.id, p.name, p.sku, p.barcode, p.sell_price, p.tax_rate, p.max_discount_amount, m.url AS image_url,
                COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm
                          WHERE sm.product_id = p.id AND sm.store_id = ? AND sm.variant IS NULL), 0) AS stock_on_hand,
                (SELECT COUNT(*) FROM products_variants pv WHERE pv._parent_id = p.id) AS variant_count
         FROM products p
         LEFT JOIN media m ON m.id = p.image_id
         WHERE p.tenant_id = ? AND p.is_active = 1
         ORDER BY p.name LIMIT 5000`,
        [storeId, tenantId],
      )
      .then((rows) => {
        if (active) setCatalog(rows);
      });
    return () => {
      active = false;
    };
  }, [tenantId, storeId]);

  // Idle-state default is this store's recently sold products, not the
  // whole catalog - matches the web Sell page's own "search-first" flow
  // (idle center area isn't meant to be a full product browser), while
  // still giving a cashier something tappable without having to type/scan
  // first. Ordered by most recent sale; catalog above already holds the
  // full product rows, so this only needs to fetch the id ordering.
  useEffect(() => {
    if (storeId == null) return;
    let active = true;
    getDb()
      .getAll<{ product_id: number }>(
        `SELECT oli.product_id, MAX(COALESCE(o.created_at, o.synced_at)) AS last_sold
         FROM orders_line_items oli
         JOIN orders o ON o.id = oli._parent_id
         WHERE o.store_id = ?
         GROUP BY oli.product_id
         ORDER BY last_sold DESC
         LIMIT 30`,
        [storeId],
      )
      .then((rows) => {
        if (active) setRecentProductIds(rows.map((r) => r.product_id));
      });
    return () => {
      active = false;
    };
  }, [storeId]);

  // "Frequently bought with" - cross-sell suggestions computed from this
  // store's own order history: which other products have shown up in the
  // SAME order as anything currently in the cart, most-co-occurring first.
  // Recomputed whenever the cart's set of distinct products changes (a
  // quantity-only change doesn't need a requery, hence the joined-id-string
  // dependency instead of depending on `cart` itself). Empty cart just
  // falls back to the existing "recently sold" idle grid below.
  const cartProductIds = useMemo(() => [...new Set(cart.map((l) => l.product.id))].sort((a, b) => a - b), [cart]);
  const cartProductIdsKey = cartProductIds.join(',');

  useEffect(() => {
    if (storeId == null || cartProductIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFrequentlyBoughtIds([]);
      return;
    }
    let active = true;
    const placeholders = cartProductIds.map(() => '?').join(',');
    getDb()
      .getAll<{ product_id: number }>(
        `SELECT oli2.product_id, COUNT(DISTINCT oli2._parent_id) AS co_count
         FROM orders_line_items oli1
         JOIN orders_line_items oli2 ON oli2._parent_id = oli1._parent_id AND oli2.product_id NOT IN (${placeholders})
         JOIN orders o ON o.id = oli1._parent_id
         WHERE oli1.product_id IN (${placeholders}) AND o.store_id = ?
         GROUP BY oli2.product_id
         ORDER BY co_count DESC
         LIMIT 12`,
        [...cartProductIds, ...cartProductIds, storeId],
      )
      .then((rows) => {
        if (active) setFrequentlyBoughtIds(rows.map((r) => r.product_id));
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartProductIdsKey, storeId]);

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
            const max = maxDiscountAmountForLine({ quantity, product: l.product });
            return { ...l, quantity, discountAmount: Math.min(l.discountAmount, max) };
          }),
    );
  }

  function updateDiscountAmount(line: CartLine, rawValue: number) {
    const max = maxDiscountAmountForLine(line);
    const clamped = Math.min(Math.max(rawValue, 0), max);
    if (rawValue > max) {
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

  async function completeSale() {
    if (cart.length === 0 || storeId == null || tenantId == null) return;
    if (activeShift == null) {
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
    try {
      const db = getDb();
      const orderId = uuid();
      const now = new Date().toISOString();
      const paymentStatus = tenderType === 'credit' ? 'pending' : 'paid';

      // One local transaction for the order + all its line items, matching
      // apps/desktop/src/Till.tsx's completeSale() exactly, so PowerSync's
      // upload queue drains them together.
      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO orders
             (id, tenant_id, store_id, terminal, terminal_name, cashier_id, customer_id, tax_total, discount_total, total,
              tender_type, payment_status, status, created_offline, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 1, ?)`,
          [
            orderId,
            tenantId,
            storeId,
            terminalId,
            terminalName,
            user.id,
            selectedCustomer ? Number(selectedCustomer.id) : null,
            totals.taxTotal,
            totals.discountTotal,
            totals.total,
            tenderType,
            paymentStatus,
            now,
          ],
        );

        for (let i = 0; i < cart.length; i++) {
          const line = cart[i];
          await tx.execute(
            `INSERT INTO orders_line_items (id, _parent_id, _order, product_id, variant, quantity, unit_price, discount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            // Number(line.product.id): products.id is a PowerSync-implicit
            // TEXT primary key locally, but this column mirrors Postgres's
            // real INTEGER foreign key - see schema.ts's own note (ported
            // from the same fix already proven on desktop).
            [uuid(), orderId, i, Number(line.product.id), line.variant?.id ?? null, line.quantity, lineUnitPrice(line), line.discountAmount],
          );
        }
      });

      const tenderLabel = TENDER_OPTIONS.find((t) => t.value === tenderType)?.label ?? tenderType;
      showToast(`Sale completed · ${tenderLabel} · ${totals.total.toFixed(2)}`);
      setCart([]);
      setSelectedCustomer(null);
      setCartOpen(false);
    } catch (err) {
      showAlert('Error completing sale', err instanceof Error ? err.message : String(err));
    } finally {
      setCompleting(false);
    }
  }

  const trimmedQuery = query.trim();
  const checkoutDisabled = cart.length === 0 || completing || activeShift == null || (tenderType === 'credit' && !selectedCustomer);
  const checkoutLabel = completing
    ? 'Completing...'
    : activeShift == null
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
            <ShiftWidget
              payloadToken={payloadToken}
              tenantId={tenantId}
              storeId={storeId}
              terminal={terminalId}
              cashierId={user.id}
              shift={activeShift}
              onShiftChange={setActiveShift}
            />
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
              {trimmedQuery ? `No products match "${trimmedQuery}"` : catalog.length === 0 ? 'No products synced yet' : 'No sales yet at this store'}
            </Text>
            <Text className="mt-1 text-center text-muted-foreground">
              {trimmedQuery
                ? 'Try a different name, SKU, or scan the barcode directly.'
                : catalog.length === 0
                  ? 'Products will appear here once this till finishes syncing.'
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
                  const max = maxDiscountAmountForLine(item);
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
                          <Text className="text-xs text-muted-foreground">(max {max.toFixed(2)})</Text>
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
        storeId={storeId}
        onSelect={(variant) => variantPickerProduct && addToCart(variantPickerProduct, variant)}
        onClose={() => setVariantPickerProduct(null)}
      />

      <HeldSalesModal visible={heldSalesOpen} heldSales={heldSales} onResume={handleResumeSale} onClose={() => setHeldSalesOpen(false)} />
    </SafeAreaView>
  );
}
