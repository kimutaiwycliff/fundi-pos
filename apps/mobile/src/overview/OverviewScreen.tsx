import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { isLowStock } from '../inventory/types';
import { API_BASE_URL, type PayloadUser } from '../lib/auth';
import { fetchCatalog, fetchStockLevels, buildStockRows, stockByKeyMap } from '../lib/catalog';

interface TodaySummary {
  total: number;
  count: number;
}

interface UnpaidSummary {
  total: number;
  count: number;
}

interface TenderSlice {
  tender_type: string;
  total: number;
}

interface RecentOrder {
  id: string;
  total: number;
  tender_type: string;
  customer_name: string | null;
  created_at: string | null;
}

const TENDER_LABELS: Record<string, string> = { cash: 'Cash', mpesa: 'M-Pesa', credit: 'Credit' };

interface RawVariant {
  id: string;
  costPrice: number | null;
}

interface RawLineItemProduct {
  id: number;
  costPrice: number;
  variants?: RawVariant[];
}

interface RawLineItem {
  product: RawLineItemProduct | number;
  variant: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
}

interface RawOrder {
  id: string;
  total: number;
  tenderType: string;
  status: string;
  customer: { name: string | null } | number | null;
  createdAt: string;
  lineItems?: RawLineItem[];
}

// "Today so far" for this store, mirroring apps/web's dashboard overview
// (apps/web/src/app/dashboard/page.tsx) but single-store (mobile is always
// scoped to whichever branch is active) and computed entirely from a plain
// REST fetch of this store's orders - there is no local database left to
// read from. One real approximation vs web: unpaid credit here is the GROSS
// unpaid order total, not net of partial payments - credit-payments (the
// installment ledger) isn't fetched here, same as before. Refreshes on tab
// focus (not just mount) since this is the one screen a cashier is expected
// to glance back at after making a sale, unlike the rest of the app's
// mount-once screens.
export function OverviewScreen({ user, payloadToken, storeId }: { user: PayloadUser; payloadToken: string; storeId: number | null }) {
  const [today, setToday] = useState<TodaySummary>({ total: 0, count: 0 });
  const [lowStockCount, setLowStockCount] = useState(0);
  const [unpaid, setUnpaid] = useState<UnpaidSummary>({ total: 0, count: 0 });
  const [tenderMix, setTenderMix] = useState<TenderSlice[]>([]);
  const [recent, setRecent] = useState<RecentOrder[]>([]);
  const [profit, setProfit] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (storeId == null) return;
    const headers = { Authorization: `JWT ${payloadToken}` };
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const tid = tenantId(user);

    // Today's completed orders (default depth, so `lineItems[].product` -
    // including each product's own `variants` array - is populated for the
    // owner-only profit calc below) - and this store's whole unpaid-credit
    // set (not date-scoped, a tab is owed regardless of when it's viewed)
    // and its 5 most recent completed orders (not date-scoped either, same
    // as the old SQL) are separate, cheaper fetches.
    const [todayBody, unpaidBody, recentBody, catalog, levels] = await Promise.all([
      fetch(
        `${API_BASE_URL}/api/orders?where[store][equals]=${storeId}&where[status][equals]=completed&where[createdAt][greater_than_equal]=${startOfDay.toISOString()}&limit=2000`,
        { headers },
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(
        `${API_BASE_URL}/api/orders?where[store][equals]=${storeId}&where[status][equals]=completed&where[tenderType][equals]=credit&where[paymentStatus][equals]=pending&limit=2000&depth=0`,
        { headers },
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${API_BASE_URL}/api/orders?where[store][equals]=${storeId}&where[status][equals]=completed&sort=-createdAt&limit=5&depth=1`, { headers })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetchCatalog(payloadToken, tid),
      fetchStockLevels(payloadToken, storeId),
    ]);

    const todayOrders = (todayBody?.docs ?? []) as RawOrder[];
    setToday({ total: todayOrders.reduce((sum, o) => sum + o.total, 0), count: todayOrders.length });

    const tenderTotals = new Map<string, number>();
    for (const o of todayOrders) {
      tenderTotals.set(o.tenderType, (tenderTotals.get(o.tenderType) ?? 0) + o.total);
    }
    setTenderMix([...tenderTotals.entries()].map(([tender_type, total]) => ({ tender_type, total })).sort((a, b) => b.total - a.total));

    const unpaidOrders = (unpaidBody?.docs ?? []) as RawOrder[];
    setUnpaid({ total: unpaidOrders.reduce((sum, o) => sum + o.total, 0), count: unpaidOrders.length });

    const recentDocs = (recentBody?.docs ?? []) as RawOrder[];
    setRecent(
      recentDocs.map((o) => ({
        id: o.id,
        total: o.total,
        tender_type: o.tenderType,
        customer_name: typeof o.customer === 'object' ? (o.customer?.name ?? null) : null,
        created_at: o.createdAt,
      })),
    );

    // Bare products (no variants) unioned with variant rows, same "a
    // variant-having product never shows a bare-self row" rule as
    // InventoryScreen's own stock-level rows (shared via buildStockRows).
    setLowStockCount(buildStockRows(catalog, stockByKeyMap(levels)).filter(isLowStock).length);

    if (user.role === 'owner') {
      // oli.discount is a flat per-line amount (see SellScreen's cart:
      // `item.quantity * price - item.discountAmount`), not per-unit - kept
      // that way here too, matching the original SQL's own fix note.
      let profitSum = 0;
      for (const o of todayOrders) {
        for (const li of o.lineItems ?? []) {
          const product = typeof li.product === 'object' ? li.product : null;
          const variant = product && li.variant ? product.variants?.find((v) => v.id === li.variant) : undefined;
          const cost = variant?.costPrice ?? product?.costPrice ?? 0;
          profitSum += li.unitPrice * li.quantity - li.discount - cost * li.quantity;
        }
      }
      setProfit(profitSum);
    } else {
      setProfit(null);
    }
  }, [storeId, payloadToken, user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  if (storeId == null) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-lg font-semibold text-foreground">Select a branch first</Text>
        <Text className="mt-1 text-center text-muted-foreground">Use the branch switcher in More to pick a store.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-3 p-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#df5102" />}
      >
        <Text className="text-2xl font-semibold text-foreground">Today so far</Text>

        <Animated.View entering={FadeInDown.duration(200)} className="flex-row gap-3">
          <View className="flex-1 gap-1 rounded-lg border border-border bg-card p-4">
            <Text className="text-xs text-muted-foreground">Sales today</Text>
            <Text className="text-2xl font-semibold text-foreground">{today.total.toFixed(2)}</Text>
            <Text className="text-xs text-muted-foreground">{today.count} order{today.count === 1 ? '' : 's'}</Text>
          </View>
          <View className="flex-1 gap-1 rounded-lg border border-border bg-card p-4">
            <Text className="text-xs text-muted-foreground">Low stock</Text>
            <Text className={`text-2xl font-semibold ${lowStockCount > 0 ? 'text-destructive' : 'text-foreground'}`}>{lowStockCount}</Text>
            <Text className="text-xs text-muted-foreground">product{lowStockCount === 1 ? '' : 's'}</Text>
          </View>
        </Animated.View>

        {profit != null ? (
          <Animated.View entering={FadeInDown.duration(200)} className="gap-1 rounded-lg border border-border bg-card p-4">
            <Text className="text-xs text-muted-foreground">Profit today</Text>
            <Text className="text-2xl font-semibold text-foreground">{profit.toFixed(2)}</Text>
          </Animated.View>
        ) : null}

        {unpaid.count > 0 ? (
          <Animated.View entering={FadeInDown.duration(200)} className="gap-1 rounded-lg border border-destructive bg-destructive/5 p-4">
            <Text className="text-xs text-muted-foreground">Unpaid credit</Text>
            <Text className="text-2xl font-semibold text-destructive">{unpaid.total.toFixed(2)}</Text>
            <Text className="text-xs text-muted-foreground">
              {unpaid.count} tab{unpaid.count === 1 ? '' : 's'} outstanding
            </Text>
          </Animated.View>
        ) : null}

        {tenderMix.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(200)} className="gap-2 rounded-lg border border-border bg-card p-4">
            <Text className="text-xs text-muted-foreground">Payment mix today</Text>
            {tenderMix.map((slice) => (
              <View key={slice.tender_type} className="flex-row items-center justify-between">
                <Text className="text-sm text-foreground">{TENDER_LABELS[slice.tender_type] ?? slice.tender_type}</Text>
                <Text className="text-sm font-medium text-foreground">{slice.total.toFixed(2)}</Text>
              </View>
            ))}
          </Animated.View>
        ) : null}

        <View className="gap-2">
          <Text className="text-xs text-muted-foreground">Recent sales</Text>
          {recent.length === 0 ? (
            <Text className="text-center text-muted-foreground">No sales yet today.</Text>
          ) : (
            recent.map((order) => (
              <Animated.View key={order.id} entering={FadeInDown.duration(200)} className="flex-row items-center justify-between rounded-lg border border-border bg-card p-3">
                <View className="shrink">
                  <Text className="text-foreground">{order.customer_name ?? 'Walk-in'}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {TENDER_LABELS[order.tender_type] ?? order.tender_type} · {order.created_at ? new Date(order.created_at).toLocaleTimeString() : '—'}
                  </Text>
                </View>
                <Text className="font-semibold text-foreground">{order.total.toFixed(2)}</Text>
              </Animated.View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function tenantId(user: PayloadUser): number {
  return typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
}
