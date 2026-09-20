import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { View, Text, TextInput, Pressable, FlatList, Image, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@powersync/react';
import { useMutedPlaceholderColor } from '../lib/theme';
import type { PayloadUser } from '../lib/auth';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { isLowStock, type StockLevel } from './types';
import { usePullToRefresh } from '../lib/usePullToRefresh';

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
  // Matches StockMovements.ts's own access.create - owner and manager only.
  const canManage = user.role === 'owner' || user.role === 'manager';

  const [tab, setTab] = useState<Tab>('levels');
  const [query, setQuery] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const placeholderColor = useMutedPlaceholderColor();

  // Reactive: re-runs on its own whenever products/products_variants/
  // stock_movements/media change locally (a new product, a new variant, a
  // stock adjustment landing via sync or via StockAdjustmentModal below),
  // so this list never needs a remount or a pull-to-refresh to catch up.
  // storeId ?? -1 (rather than skipping the query) since hooks can't be
  // called conditionally - a -1 store id naturally matches zero rows,
  // same empty-state result the old early-return produced.
  //
  // Bare products (no variants) unioned with one row per variant for
  // products that have them - a variant-having product never shows a
  // bare-self row, matching web's identical "tracked separately" rule.
  const { data: rawLevels, refresh: refreshLevels } = useQuery<StockLevel>(
    `SELECT p.id AS product_id, NULL AS variant_id, p.name AS product_name, NULL AS variant_label, p.sku AS sku, p.reorder_point AS reorder_point, pm.url AS image_url,
            COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm WHERE sm.product_id = p.id AND sm.store_id = ? AND sm.variant IS NULL), 0) AS quantity
     FROM products p
     LEFT JOIN media pm ON pm.id = p.image_id
     WHERE p.tenant_id = ? AND p.is_active = 1
       AND NOT EXISTS (SELECT 1 FROM products_variants pv WHERE pv._parent_id = p.id)
     UNION ALL
     SELECT p.id AS product_id, pv.id AS variant_id, p.name AS product_name, pv.label AS variant_label, pv.sku AS sku, p.reorder_point AS reorder_point, COALESCE(vm.url, pm.url) AS image_url,
            COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm WHERE sm.variant = pv.id AND sm.store_id = ?), 0) AS quantity
     FROM products_variants pv
     JOIN products p ON p.id = pv._parent_id
     LEFT JOIN media pm ON pm.id = p.image_id
     LEFT JOIN media vm ON vm.id = pv.image_id
     WHERE p.tenant_id = ? AND p.is_active = 1
     ORDER BY product_name`,
    [storeId ?? -1, tenantId, storeId ?? -1, tenantId],
  );
  const levels = useMemo(() => [...rawLevels].sort((a, b) => Number(isLowStock(b)) - Number(isLowStock(a))), [rawLevels]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return levels;
    const fuse = new Fuse(levels, { threshold: 0.4, ignoreLocation: true, keys: ['product_name', 'variant_label', 'sku'] });
    return fuse.search(trimmed).map((r) => r.item);
  }, [query, levels]);

  const { data: flagged, refresh: refreshFlagged } = useQuery<FlaggedMovement>(
    `SELECT sm.id, sm.quantity_delta, sm.reason, sm.source_terminal, sm.client_timestamp, p.name AS product_name
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     WHERE sm.store_id = ? AND sm.flagged_for_review = 1
     ORDER BY sm.client_timestamp DESC LIMIT 100`,
    [storeId ?? -1],
  );

  const levelsRefresh = usePullToRefresh(refreshLevels!);
  const flaggedRefresh = usePullToRefresh(refreshFlagged!);

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
        {canManage ? (
          <Pressable android_ripple={{ color: '#ffffff40' }} className="rounded-md bg-primary px-3 py-2 active:opacity-80" onPress={() => setAdjustOpen(true)}>
            <Text className="text-sm font-medium text-primary-foreground">Adjust</Text>
          </Pressable>
        ) : null}
      </View>

      {tab === 'levels' ? (
        <View className="border-b border-border p-3">
          <TextInput
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
            placeholder="Search by name, variant, or SKU..."
            placeholderTextColor={placeholderColor}
            value={query}
            onChangeText={setQuery}
          />
        </View>
      ) : null}

      {tab === 'levels' ? (
        <FlatList
          className="flex-1"
          contentContainerClassName="gap-2 p-3"
          data={results}
          keyExtractor={(l) => `${l.product_id}::${l.variant_id ?? ''}`}
          refreshControl={<RefreshControl refreshing={levelsRefresh.refreshing} onRefresh={levelsRefresh.onRefresh} tintColor="#df5102" />}
          ListEmptyComponent={
            <Text className="mt-8 text-center text-muted-foreground">{query.trim() ? 'No matches found.' : 'No products yet.'}</Text>
          }
          renderItem={({ item }) => {
            const low = isLowStock(item);
            return (
              <Animated.View entering={FadeInDown.duration(200)} className={`flex-row items-center justify-between rounded-lg border p-3 ${low ? 'border-destructive bg-destructive/5' : 'border-border bg-card'}`}>
                <View className="flex-1 flex-row items-center gap-3">
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} className="h-10 w-10 rounded-md bg-muted" resizeMode="cover" />
                  ) : (
                    <View className="h-10 w-10 items-center justify-center rounded-md bg-muted">
                      <Ionicons name="image-outline" size={16} color="#71717a" />
                    </View>
                  )}
                  <View className="shrink">
                    <Text className="font-medium text-foreground">{item.variant_label ? `${item.product_name} — ${item.variant_label}` : item.product_name}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {item.sku}
                      {item.reorder_point > 0 ? ` · reorder at ${item.reorder_point}` : ''}
                    </Text>
                  </View>
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
          refreshControl={<RefreshControl refreshing={flaggedRefresh.refreshing} onRefresh={flaggedRefresh.onRefresh} tintColor="#df5102" />}
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
          refreshLevels?.();
          refreshFlagged?.();
        }}
      />
    </SafeAreaView>
  );
}
