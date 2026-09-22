import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Fuse from 'fuse.js';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMutedPlaceholderColor } from '../lib/theme';
import { View, Text, TextInput, Pressable, FlatList, Modal, ScrollView, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { API_BASE_URL, type PayloadUser } from '../lib/auth';
import { PaymentModal, type LocalOrder } from './PaymentModal';
import { usePullToRefresh } from '../lib/usePullToRefresh';

interface LocalCustomer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyalty_points: number;
  unpaid_total: number;
  unpaid_count: number;
}

interface RecentOrder {
  id: string;
  total: number;
  tender_type: string;
  payment_status: string;
  created_at: string | null;
  synced_at: string | null;
}

interface RawCustomer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number | null;
}

interface RawOrder {
  id: string;
  total: number;
  tenderType: string;
  paymentStatus: string;
  status: string;
  createdAt: string;
  customer: { id: number } | number | null;
}

function orderDateLabel(o: Pick<RecentOrder, 'created_at' | 'synced_at'>): string {
  const iso = o.created_at ?? o.synced_at;
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

function customerIdOf(o: RawOrder): number | null {
  if (o.customer == null) return null;
  return typeof o.customer === 'object' ? o.customer.id : o.customer;
}

// Phase 2 - credit customer management. Customer list, loyalty points and
// order/unpaid-credit history now come from a plain REST fetch of this
// store's whole order history plus the tenant's whole customer list (this
// app is online-only - there is no local database left to query), combined
// client-side the same "fetch everything, filter/aggregate in memory" way
// SellScreen's own catalog+order-history fetch does; only recording a
// payment requires its own separate call - see PaymentModal's own note on
// why credit-payments isn't fetched here. Unpaid credit is deliberately not
// date-scoped (a tab is still owed regardless of what period is being
// viewed), and store-scoped rather than tenant-wide, matching
// apps/desktop/src/Till.tsx's identical "this store" unpaid-credit stat.
export function CustomersScreen({ user, payloadToken, storeId }: { user: PayloadUser; payloadToken: string; storeId: number | null }) {
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;

  const placeholderColor = useMutedPlaceholderColor();
  const [query, setQuery] = useState('');
  const [rawCustomers, setRawCustomers] = useState<RawCustomer[]>([]);
  const [rawOrders, setRawOrders] = useState<RawOrder[]>([]);
  const [detailCustomer, setDetailCustomer] = useState<LocalCustomer | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<LocalOrder | null>(null);

  // Whole tenant's customer list plus this store's whole order history,
  // fetched together and re-fetched on pull-to-refresh/tab-focus - same
  // "fetch everything, aggregate/filter in memory" shape as SellScreen's own
  // catalog+order-history fetch. depth=1 on the orders fetch populates each
  // order's `customer` relation as {id,...} so unpaid totals/per-customer
  // history can be grouped client-side without a second round trip per
  // customer.
  const refresh = useCallback(async () => {
    if (storeId == null) {
      setRawCustomers([]);
      setRawOrders([]);
      return;
    }
    const headers = { Authorization: `JWT ${payloadToken}` };
    const [customersBody, ordersBody] = await Promise.all([
      fetch(`${API_BASE_URL}/api/customers?where[tenant][equals]=${tenantId}&sort=name&limit=2000`, { headers })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${API_BASE_URL}/api/orders?where[store][equals]=${storeId}&sort=-createdAt&limit=5000&depth=1`, { headers })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    setRawCustomers(customersBody?.docs ?? []);
    setRawOrders(ordersBody?.docs ?? []);
  }, [storeId, tenantId, payloadToken]);

  // Refetches on every tab focus (not just mount) - this screen stays
  // mounted across tab switches, so its data could otherwise go stale
  // while on a different tab until manually pulled down. Same pattern
  // already proven in OverviewScreen.tsx.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  // Unpaid credit is aggregated per customer from the already-fetched order
  // list (orders already sorted -createdAt) rather than a second query -
  // "highest unpaid balance first" ordering matches the old SQL's own
  // `ORDER BY unpaid_total DESC, name`.
  const candidates = useMemo<LocalCustomer[]>(() => {
    const unpaidByCustomer = new Map<number, { total: number; count: number }>();
    for (const o of rawOrders) {
      if (o.status !== 'completed' || o.tenderType !== 'credit' || o.paymentStatus !== 'pending') continue;
      const cid = customerIdOf(o);
      if (cid == null) continue;
      const entry = unpaidByCustomer.get(cid) ?? { total: 0, count: 0 };
      entry.total += o.total;
      entry.count += 1;
      unpaidByCustomer.set(cid, entry);
    }
    return rawCustomers
      .map((c) => {
        const unpaid = unpaidByCustomer.get(c.id) ?? { total: 0, count: 0 };
        return { id: String(c.id), name: c.name, phone: c.phone ?? null, email: c.email ?? null, loyalty_points: c.loyaltyPoints ?? 0, unpaid_total: unpaid.total, unpaid_count: unpaid.count };
      })
      .sort((a, b) => b.unpaid_total - a.unpaid_total || a.name.localeCompare(b.name));
  }, [rawCustomers, rawOrders]);

  const customers = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return candidates.slice(0, 50);
    const fuse = new Fuse(candidates, { threshold: 0.4, ignoreLocation: true, keys: ['name', 'phone'] });
    const matched = new Set(fuse.search(trimmed).map((r) => r.item.id));
    return candidates.filter((c) => matched.has(c.id)).slice(0, 50);
  }, [query, candidates]);

  // This customer's full order history at this store - filtered from the
  // already-fetched rawOrders rather than a second per-customer fetch, same
  // "fetch everything, filter in memory" reasoning as candidates above.
  // synced_at has no REST equivalent (it was a PowerSync-local insert-time
  // marker) - always null now, which orderDateLabel already falls back past
  // since created_at is always present from the server.
  const orders = useMemo<RecentOrder[]>(() => {
    if (!detailCustomer) return [];
    const id = Number(detailCustomer.id);
    return rawOrders
      .filter((o) => customerIdOf(o) === id)
      .slice(0, 20)
      .map((o) => ({ id: o.id, total: o.total, tender_type: o.tenderType, payment_status: o.paymentStatus, created_at: o.createdAt, synced_at: null }));
  }, [detailCustomer, rawOrders]);

  if (storeId == null) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-lg font-semibold text-foreground">Select a branch first</Text>
        <Text className="mt-1 text-center text-muted-foreground">Use the branch switcher in More to pick a store.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
    <View className="flex-1 bg-background">
      <View className="border-b border-border p-3">
        <TextInput
          className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          placeholder="Search customers by name or phone..."
          placeholderTextColor={placeholderColor}
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <FlatList
        className="flex-1"
        contentContainerClassName="p-3"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#df5102" />}
        data={customers}
        keyExtractor={(c) => c.id}
        ListEmptyComponent={<Text className="mt-8 text-center text-muted-foreground">No customers yet.</Text>}
        renderItem={({ item }) => (
          <Animated.View entering={FadeInDown.duration(220)}>
          <Pressable android_ripple={{}} className="mb-2 rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setDetailCustomer(item)}>
            <View className="flex-row items-center justify-between">
              <View className="shrink">
                <Text className="font-medium text-foreground">{item.name}</Text>
                <Text className="text-xs text-muted-foreground">
                  {item.phone ?? 'No phone'} · {item.loyalty_points} pts
                </Text>
              </View>
              {item.unpaid_count > 0 ? (
                <View className="items-end">
                  <Text className="font-semibold text-destructive">{item.unpaid_total.toFixed(2)}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {item.unpaid_count} unpaid tab{item.unpaid_count === 1 ? '' : 's'}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
          </Animated.View>
        )}
      />

      <Modal visible={detailCustomer != null} animationType="slide" onRequestClose={() => setDetailCustomer(null)}>
        <SafeAreaView edges={['top']} className="flex-1 bg-background">
          <View className="flex-row items-center justify-between border-b border-border px-4 pb-3">
            <View>
              <Text className="text-lg font-semibold text-foreground">{detailCustomer?.name}</Text>
              <Text className="text-sm text-muted-foreground">
                {detailCustomer?.phone ?? 'No phone'} · {detailCustomer?.loyalty_points} loyalty points
              </Text>
            </View>
            <Pressable android_ripple={{}} onPress={() => setDetailCustomer(null)}>
              <Text className="text-muted-foreground">Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="gap-2 p-4">
            {detailCustomer && detailCustomer.unpaid_count > 0 ? (
              <>
                <Text className="font-medium text-foreground">Unpaid credit</Text>
                {orders
                  .filter((o) => o.tender_type === 'credit' && o.payment_status === 'pending')
                  .map((o) => (
                    <View key={o.id} className="flex-row items-center justify-between rounded-lg border border-border p-3">
                      <View>
                        <Text className="text-foreground">#{o.id.slice(0, 8)}</Text>
                        <Text className="text-xs text-muted-foreground">
                          {orderDateLabel(o)}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-3">
                        <Text className="font-semibold text-destructive">{o.total.toFixed(2)}</Text>
                        <Pressable android_ripple={{ color: '#ffffff40' }}
                          className="rounded-md bg-primary px-3 py-1.5 active:opacity-80"
                          onPress={() => setPaymentOrder({ id: o.id, total: o.total, created_at: o.created_at, synced_at: o.synced_at })}
                        >
                          <Text className="text-sm font-medium text-primary-foreground">Pay</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
              </>
            ) : null}

            <Text className="mt-4 font-medium text-foreground">Purchase history</Text>
            {orders.length === 0 ? (
              <Text className="text-muted-foreground">No orders for this customer at this store yet.</Text>
            ) : (
              orders.map((o) => (
                <View key={o.id} className="flex-row items-center justify-between rounded-lg border border-border p-3">
                  <View>
                    <Text className="text-foreground">#{o.id.slice(0, 8)}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {orderDateLabel(o)} · {o.tender_type}
                      {o.tender_type === 'credit' ? ` · ${o.payment_status}` : ''}
                    </Text>
                  </View>
                  <Text className="font-medium text-foreground">{o.total.toFixed(2)}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <PaymentModal
        order={paymentOrder}
        user={user}
        payloadToken={payloadToken}
        onClose={() => setPaymentOrder(null)}
        onRecorded={refresh}
      />
    </View>
    </KeyboardAvoidingView>
  );
}
