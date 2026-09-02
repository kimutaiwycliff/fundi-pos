import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDb } from '../db/database';
import { isLowStock, type StockLevel } from '../inventory/types';
import type { PayloadUser } from '../lib/auth';

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

// "Today so far" for this store, mirroring apps/web's dashboard overview
// (apps/web/src/app/dashboard/page.tsx) but single-store (mobile is always
// scoped to whichever branch is active) and computed entirely from already-
// synced local tables - no live call, works offline like everything else in
// this app. One real approximation vs web: unpaid credit here is the GROSS
// unpaid order total, not net of partial payments - credit_payments (the
// installment ledger) isn't synced to mobile at all (see schema.ts), so a
// customer who's paid down part of a credit sale still shows its full
// original total here until fully settled. Refreshes on tab focus (not just
// mount) since this is the one screen a cashier is expected to glance back
// at after making a sale, unlike the rest of the app's mount-once screens.
export function OverviewScreen({ user, storeId }: { user: PayloadUser; storeId: number | null }) {
  const [today, setToday] = useState<TodaySummary>({ total: 0, count: 0 });
  const [lowStockCount, setLowStockCount] = useState(0);
  const [unpaid, setUnpaid] = useState<UnpaidSummary>({ total: 0, count: 0 });
  const [tenderMix, setTenderMix] = useState<TenderSlice[]>([]);
  const [recent, setRecent] = useState<RecentOrder[]>([]);
  const [profit, setProfit] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (storeId == null) return;
    const db = getDb();

    db.getAll<TodaySummary>(
      `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count FROM orders
       WHERE store_id = ? AND status = 'completed' AND date(COALESCE(created_at, synced_at), 'localtime') = date('now', 'localtime')`,
      [storeId],
    ).then((rows) => setToday(rows[0] ?? { total: 0, count: 0 }));

    db.getAll<UnpaidSummary>(
      `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count FROM orders
       WHERE store_id = ? AND status = 'completed' AND tender_type = 'credit' AND payment_status = 'pending'`,
      [storeId],
    ).then((rows) => setUnpaid(rows[0] ?? { total: 0, count: 0 }));

    db.getAll<TenderSlice>(
      `SELECT tender_type, COALESCE(SUM(total), 0) AS total FROM orders
       WHERE store_id = ? AND status = 'completed' AND date(COALESCE(created_at, synced_at), 'localtime') = date('now', 'localtime')
       GROUP BY tender_type ORDER BY total DESC`,
      [storeId],
    ).then(setTenderMix);

    db.getAll<RecentOrder>(
      `SELECT o.id, o.total, o.tender_type, c.name AS customer_name, COALESCE(o.created_at, o.synced_at) AS created_at
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.store_id = ? AND o.status = 'completed'
       ORDER BY COALESCE(o.created_at, o.synced_at) DESC LIMIT 5`,
      [storeId],
    ).then(setRecent);

    // Bare products (no variants) unioned with variant rows, same "a
    // variant-having product never shows a bare-self row" rule as
    // InventoryScreen's own levels query.
    db.getAll<StockLevel>(
      `SELECT p.id AS product_id, NULL AS variant_id, p.reorder_point AS reorder_point,
              COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm WHERE sm.product_id = p.id AND sm.store_id = ? AND sm.variant IS NULL), 0) AS quantity
       FROM products p
       WHERE p.tenant_id = ? AND p.is_active = 1
         AND NOT EXISTS (SELECT 1 FROM products_variants pv WHERE pv._parent_id = p.id)
       UNION ALL
       SELECT p.id AS product_id, pv.id AS variant_id, p.reorder_point AS reorder_point,
              COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm WHERE sm.variant = pv.id AND sm.store_id = ?), 0) AS quantity
       FROM products_variants pv
       JOIN products p ON p.id = pv._parent_id
       WHERE p.tenant_id = ? AND p.is_active = 1`,
      [storeId, tenantId(user), storeId, tenantId(user)],
    ).then((rows) => setLowStockCount(rows.filter(isLowStock).length));

    if (user.role === 'owner') {
      db.getAll<{ profit: number }>(
        `SELECT COALESCE(SUM((oli.unit_price - oli.discount) * oli.quantity - COALESCE(pv.cost_price, p.cost_price, 0) * oli.quantity), 0) AS profit
         FROM orders_line_items oli
         JOIN orders o ON o.id = oli._parent_id
         LEFT JOIN products p ON p.id = oli.product_id
         LEFT JOIN products_variants pv ON pv.id = oli.variant
         WHERE o.store_id = ? AND o.status = 'completed' AND date(COALESCE(o.created_at, o.synced_at), 'localtime') = date('now', 'localtime')`,
        [storeId],
      ).then((rows) => setProfit(rows[0]?.profit ?? 0));
    }
  }, [storeId, user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

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
      <ScrollView contentContainerClassName="gap-3 p-4">
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
