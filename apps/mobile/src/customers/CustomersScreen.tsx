import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Modal, ScrollView } from 'react-native';
import { getDb } from '../db/database';
import type { PayloadUser } from '../lib/auth';
import { PaymentModal, type LocalOrder } from './PaymentModal';

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

// synced_at is always set at local insert time (see SellScreen's
// completeSale) - created_at only arrives once an order syncs up and back
// down. Falling back to Date.now() when both are somehow null would call an
// impure function during render, so this renders a dash instead - a
// genuinely dateless order isn't expected to occur in practice.
function orderDateLabel(o: Pick<RecentOrder, 'created_at' | 'synced_at'>): string {
  const iso = o.created_at ?? o.synced_at;
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

// Phase 2 - credit customer management. Customer list, loyalty points and
// order/unpaid-credit history all come from the locally-synced tables
// (offline, same as Sell); only recording a payment requires connectivity -
// see PaymentModal's own note on why credit-payments isn't part of the
// synced schema. Unpaid credit is deliberately not date-scoped (a tab is
// still owed regardless of what period is being viewed), and store-scoped
// rather than tenant-wide, matching apps/desktop/src/Till.tsx's identical
// "this store" unpaid-credit stat.
export function CustomersScreen({ user, payloadToken, storeId }: { user: PayloadUser; payloadToken: string; storeId: number | null }) {
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;

  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [detailCustomer, setDetailCustomer] = useState<LocalCustomer | null>(null);
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [paymentOrder, setPaymentOrder] = useState<LocalOrder | null>(null);

  const refreshCustomers = useCallback(() => {
    if (storeId == null) {
      setCustomers([]);
      return;
    }
    const trimmed = query.trim();
    getDb()
      .getAll<LocalCustomer>(
        `SELECT c.id, c.name, c.phone, c.email, c.loyalty_points,
                COALESCE((SELECT SUM(o.total) FROM orders o WHERE o.customer_id = c.id AND o.store_id = ? AND o.status = 'completed' AND o.tender_type = 'credit' AND o.payment_status = 'pending'), 0) AS unpaid_total,
                COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.store_id = ? AND o.status = 'completed' AND o.tender_type = 'credit' AND o.payment_status = 'pending'), 0) AS unpaid_count
         FROM customers c
         WHERE c.tenant_id = ? AND (c.name LIKE ? OR c.phone LIKE ?)
         ORDER BY unpaid_total DESC, c.name LIMIT 50`,
        [storeId, storeId, tenantId, `%${trimmed}%`, `%${trimmed}%`],
      )
      .then(setCustomers);
  }, [storeId, tenantId, query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCustomers();
  }, [refreshCustomers]);

  const refreshOrders = useCallback(() => {
    if (!detailCustomer || storeId == null) {
      setOrders([]);
      return;
    }
    getDb()
      .getAll<RecentOrder>(
        `SELECT id, total, tender_type, payment_status, created_at, synced_at FROM orders
         WHERE customer_id = ? AND store_id = ? ORDER BY COALESCE(created_at, synced_at) DESC LIMIT 20`,
        [Number(detailCustomer.id), storeId],
      )
      .then(setOrders);
  }, [detailCustomer, storeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshOrders();
  }, [refreshOrders]);

  if (storeId == null) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-lg font-semibold text-foreground">Select a branch first</Text>
        <Text className="mt-1 text-center text-muted-foreground">Use the branch switcher in More to pick a store.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border p-3">
        <TextInput
          className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          placeholder="Search customers by name or phone..."
          placeholderTextColor="#6e605a"
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <FlatList
        className="flex-1"
        contentContainerClassName="p-3"
        data={customers}
        keyExtractor={(c) => c.id}
        ListEmptyComponent={<Text className="mt-8 text-center text-muted-foreground">No customers yet.</Text>}
        renderItem={({ item }) => (
          <Pressable className="mb-2 rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setDetailCustomer(item)}>
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
        )}
      />

      <Modal visible={detailCustomer != null} animationType="slide" onRequestClose={() => setDetailCustomer(null)}>
        <View className="flex-1 bg-background pt-14">
          <View className="flex-row items-center justify-between border-b border-border px-4 pb-3">
            <View>
              <Text className="text-lg font-semibold text-foreground">{detailCustomer?.name}</Text>
              <Text className="text-sm text-muted-foreground">
                {detailCustomer?.phone ?? 'No phone'} · {detailCustomer?.loyalty_points} loyalty points
              </Text>
            </View>
            <Pressable onPress={() => setDetailCustomer(null)}>
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
                        <Pressable
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
        </View>
      </Modal>

      <PaymentModal
        order={paymentOrder}
        user={user}
        payloadToken={payloadToken}
        onClose={() => setPaymentOrder(null)}
        onRecorded={() => {
          refreshOrders();
          refreshCustomers();
        }}
      />
    </View>
  );
}
