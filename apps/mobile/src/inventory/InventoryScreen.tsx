import { useCallback, useEffect, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { View, Text, Pressable, FlatList } from 'react-native';
import { getDb } from '../db/database';
import type { PayloadUser } from '../lib/auth';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { isLowStock, type StockLevel } from './types';

interface FlaggedMovement {
  id: string;
  quantity_delta: number;
  reason: string;
  source_terminal: string;
  client_timestamp: string;
  product_name: string;
}

type Tab = 'levels' | 'exceptions';

// Phase 3 - inventory management. Stock levels and exceptions both come
// from the locally-synced stock_movements ledger (offline, same derived-sum
// semantics as apps/desktop and /api/reports/stock-levels - current stock
// is never a stored count). Stock transfers (a separate two-store, multi-
// line-item, manager-gated workflow per StockTransfers.ts's access rules)
// aren't built yet - deferred the same way Phase 1's printing/scanning was.
export function InventoryScreen({ user, terminalId, storeId }: { user: PayloadUser; terminalId: string; storeId: number | null }) {
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;

  const [tab, setTab] = useState<Tab>('levels');
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [flagged, setFlagged] = useState<FlaggedMovement[]>([]);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const refreshLevels = useCallback(() => {
    if (storeId == null) {
      setLevels([]);
      return;
    }
    // Bare products (no variants) unioned with one row per variant for
    // products that have them - a variant-having product never shows a
    // bare-self row, matching web's identical "tracked separately" rule.
    getDb()
      .getAll<StockLevel>(
        `SELECT p.id AS product_id, NULL AS variant_id, p.name AS product_name, NULL AS variant_label, p.sku AS sku, p.reorder_point AS reorder_point,
                COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm WHERE sm.product_id = p.id AND sm.store_id = ? AND sm.variant IS NULL), 0) AS quantity
         FROM products p
         WHERE p.tenant_id = ? AND p.is_active = 1
           AND NOT EXISTS (SELECT 1 FROM products_variants pv WHERE pv._parent_id = p.id)
         UNION ALL
         SELECT p.id AS product_id, pv.id AS variant_id, p.name AS product_name, pv.label AS variant_label, pv.sku AS sku, p.reorder_point AS reorder_point,
                COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm WHERE sm.variant = pv.id AND sm.store_id = ?), 0) AS quantity
         FROM products_variants pv
         JOIN products p ON p.id = pv._parent_id
         WHERE p.tenant_id = ? AND p.is_active = 1
         ORDER BY product_name`,
        [storeId, tenantId, storeId, tenantId],
      )
      .then((rows) => {
        setLevels([...rows].sort((a, b) => Number(isLowStock(b)) - Number(isLowStock(a))));
      });
  }, [storeId, tenantId]);

  const refreshFlagged = useCallback(() => {
    if (storeId == null) {
      setFlagged([]);
      return;
    }
    getDb()
      .getAll<FlaggedMovement>(
        `SELECT sm.id, sm.quantity_delta, sm.reason, sm.source_terminal, sm.client_timestamp, p.name AS product_name
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         WHERE sm.store_id = ? AND sm.flagged_for_review = 1
         ORDER BY sm.client_timestamp DESC LIMIT 100`,
        [storeId],
      )
      .then(setFlagged);
  }, [storeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshLevels();
    refreshFlagged();
  }, [refreshLevels, refreshFlagged]);

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
      <View className="flex-row items-center justify-between gap-2 border-b border-border p-3">
        <View className="flex-1 flex-row gap-1.5">
          <Pressable android_ripple={{ color: '#ffffff40' }} className={`flex-1 items-center rounded-md border py-2 ${tab === 'levels' ? 'border-primary bg-primary' : 'border-border'}`} onPress={() => setTab('levels')}>
            <Text className={tab === 'levels' ? 'font-medium text-primary-foreground' : 'text-foreground'}>Levels</Text>
          </Pressable>
          <Pressable android_ripple={{ color: '#ffffff40' }} className={`flex-1 items-center rounded-md border py-2 ${tab === 'exceptions' ? 'border-primary bg-primary' : 'border-border'}`} onPress={() => setTab('exceptions')}>
            <Text className={tab === 'exceptions' ? 'font-medium text-primary-foreground' : 'text-foreground'}>
              Exceptions{flagged.length > 0 ? ` (${flagged.length})` : ''}
            </Text>
          </Pressable>
        </View>
        <Pressable android_ripple={{ color: '#ffffff40' }} className="rounded-md bg-primary px-3 py-2 active:opacity-80" onPress={() => setAdjustOpen(true)}>
          <Text className="text-sm font-medium text-primary-foreground">Adjust</Text>
        </Pressable>
      </View>

      {tab === 'levels' ? (
        <FlatList
          className="flex-1"
          contentContainerClassName="gap-2 p-3"
          data={levels}
          keyExtractor={(l) => `${l.product_id}::${l.variant_id ?? ''}`}
          ListEmptyComponent={<Text className="mt-8 text-center text-muted-foreground">No products yet.</Text>}
          renderItem={({ item }) => {
            const low = isLowStock(item);
            return (
              <Animated.View entering={FadeInDown.duration(200)} className={`flex-row items-center justify-between rounded-lg border p-3 ${low ? 'border-destructive bg-destructive/5' : 'border-border bg-card'}`}>
                <View className="shrink">
                  <Text className="font-medium text-foreground">{item.variant_label ? `${item.product_name} — ${item.variant_label}` : item.product_name}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {item.sku}
                    {item.reorder_point > 0 ? ` · reorder at ${item.reorder_point}` : ''}
                  </Text>
                </View>
                <Text className={low ? 'font-semibold text-destructive' : 'font-semibold text-foreground'}>{item.quantity}</Text>
              </Animated.View>
            );
          }}
        />
      ) : (
        <FlatList
          className="flex-1"
          contentContainerClassName="gap-2 p-3"
          data={flagged}
          keyExtractor={(m) => m.id}
          ListEmptyComponent={<Text className="mt-8 text-center text-muted-foreground">No exceptions - nothing has gone negative.</Text>}
          renderItem={({ item }) => (
            <Animated.View entering={FadeInDown.duration(200)} className="rounded-lg border border-border bg-card p-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-medium text-foreground">{item.product_name}</Text>
                <Text className="font-semibold text-destructive">{item.quantity_delta}</Text>
              </View>
              <Text className="text-xs text-muted-foreground">
                {item.reason} · {item.source_terminal} · {new Date(item.client_timestamp).toLocaleString()}
              </Text>
            </Animated.View>
          )}
        />
      )}

      <StockAdjustmentModal
        visible={adjustOpen}
        tenantId={tenantId}
        storeId={storeId}
        terminalId={terminalId}
        onClose={() => setAdjustOpen(false)}
        onRecorded={() => {
          refreshLevels();
          refreshFlagged();
        }}
      />
    </View>
  );
}
