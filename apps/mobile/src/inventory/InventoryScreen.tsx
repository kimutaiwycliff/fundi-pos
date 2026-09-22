import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Fuse from 'fuse.js';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { View, Text, TextInput, Pressable, FlatList, Image, RefreshControl, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useMutedPlaceholderColor } from '../lib/theme';
import { API_BASE_URL, type PayloadUser } from '../lib/auth';
import { fetchCatalog, fetchStockLevels, buildStockRows, stockByKeyMap, type CatalogProduct } from '../lib/catalog';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { isLowStock } from './types';
import { usePullToRefresh } from '../lib/usePullToRefresh';

interface RawFlaggedMovement {
  id: string;
  quantityDelta: number;
  reason: string;
  sourceTerminal: string;
  clientTimestamp: string;
  product: { name: string } | number;
}

interface FlaggedMovement {
  id: string;
  quantity_delta: number;
  reason: string;
  source_terminal: string;
  client_timestamp: string;
  product_name: string;
}

function mapFlagged(m: RawFlaggedMovement): FlaggedMovement {
  return {
    id: m.id,
    quantity_delta: m.quantityDelta,
    reason: m.reason,
    source_terminal: m.sourceTerminal,
    client_timestamp: m.clientTimestamp,
    product_name: typeof m.product === 'object' ? m.product.name : `#${m.product}`,
  };
}

type Tab = 'levels' | 'exceptions';

// Phase 3 - inventory management. Stock levels come from a plain REST
// fetch of the catalog + /api/reports/stock-levels (same derived-sum
// semantics as apps/desktop and apps/web - current stock is never a stored
// count); exceptions come from Payload's own stock-movements collection,
// filtered to flaggedForReview - there is no local database left to read
// either from (this app is online-only now). Stock transfers (a separate
// two-store, multi-line-item, manager-gated workflow per
// StockTransfers.ts's access rules) aren't built yet - deferred the same
// way Phase 1's printing/scanning was.
export function InventoryScreen({ user, payloadToken, terminalId, storeId }: { user: PayloadUser; payloadToken: string; terminalId: string; storeId: number | null }) {
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
  // Matches StockMovements.ts's own access.create - owner and manager only.
  const canManage = user.role === 'owner' || user.role === 'manager';

  const [tab, setTab] = useState<Tab>('levels');
  const [query, setQuery] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const placeholderColor = useMutedPlaceholderColor();

  const [rawCatalog, setRawCatalog] = useState<CatalogProduct[]>([]);
  const [stockByKey, setStockByKey] = useState<Map<string, number>>(new Map());
  const [flagged, setFlagged] = useState<FlaggedMovement[]>([]);

  // Whole active catalog for this tenant plus this store's stock levels,
  // fetched together - same "fetch everything, filter in memory" shape as
  // SellScreen's own catalog fetch. buildStockRows reproduces the old SQL's
  // union exactly: bare products (no variants) get one row, products WITH
  // variants get one row per variant, never both.
  const refreshLevels = useCallback(async () => {
    const [catalog, levels] = await Promise.all([
      fetchCatalog(payloadToken, tenantId),
      storeId != null ? fetchStockLevels(payloadToken, storeId) : Promise.resolve([]),
    ]);
    setRawCatalog(catalog);
    setStockByKey(stockByKeyMap(levels));
  }, [payloadToken, tenantId, storeId]);

  const rawLevels = useMemo(() => buildStockRows(rawCatalog, stockByKey), [rawCatalog, stockByKey]);
  const levels = useMemo(() => [...rawLevels].sort((a, b) => Number(isLowStock(b)) - Number(isLowStock(a))), [rawLevels]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return levels;
    const fuse = new Fuse(levels, { threshold: 0.4, ignoreLocation: true, keys: ['product_name', 'variant_label', 'sku'] });
    return fuse.search(trimmed).map((r) => r.item);
  }, [query, levels]);

  // Exceptions - Payload's own stock-movements collection (default REST),
  // filtered to rows the server flagged for going negative (see
  // StockMovements.ts's own afterChange hook, unchanged) - no local ledger
  // left to read this from anymore.
  const refreshFlagged = useCallback(async () => {
    if (storeId == null) {
      setFlagged([]);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/stock-movements?where[store][equals]=${storeId}&where[flaggedForReview][equals]=true&sort=-clientTimestamp&limit=100&depth=1`,
        { headers: { Authorization: `JWT ${payloadToken}` } },
      );
      const body = res.ok ? await res.json().catch(() => null) : null;
      setFlagged(((body?.docs ?? []) as RawFlaggedMovement[]).map(mapFlagged));
    } catch {
      setFlagged([]);
    }
  }, [storeId, payloadToken]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshLevels(), refreshFlagged()]);
  }, [refreshLevels, refreshFlagged]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const levelsRefresh = usePullToRefresh(refreshLevels);
  const flaggedRefresh = usePullToRefresh(refreshFlagged);

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

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
        payloadToken={payloadToken}
        tenantId={tenantId}
        storeId={storeId}
        terminalId={terminalId}
        onClose={() => setAdjustOpen(false)}
        onRecorded={refresh}
      />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
