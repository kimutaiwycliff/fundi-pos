import { useCallback, useEffect, useState } from 'react';
import { Text, View, Pressable, FlatList, RefreshControl } from 'react-native';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { fetchQuotations, type QuotationListItem } from './quotations';

// REST-backed (not PowerSync/local), same shape as PurchaseOrderListScreen.tsx:
// a plain refetch (not a reactive query) wired to pull-to-refresh via
// usePullToRefresh, since this list can change from elsewhere (another
// till, the web dashboard) with no local sync to pick it up automatically.
export function QuotationListScreen({ payloadToken, onOpen, onNew }: { payloadToken: string; onOpen: (id: number) => void; onNew: () => void }) {
  const [quotations, setQuotations] = useState<QuotationListItem[]>([]);

  const refresh = useCallback(() => fetchQuotations(payloadToken).then(setQuotations), [payloadToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  return (
    <FlatList
      className="flex-1 bg-background px-4 pt-3"
      data={quotations}
      keyExtractor={(q) => String(q.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#df5102" />}
      ListHeaderComponent={
        <Pressable android_ripple={{ color: '#ffffff40' }} className="mb-3 items-center rounded-lg bg-primary py-3 active:opacity-80" onPress={onNew}>
          <Text className="font-medium text-primary-foreground">New quotation</Text>
        </Pressable>
      }
      ListEmptyComponent={<Text className="text-sm text-muted-foreground">No quotations yet.</Text>}
      renderItem={({ item: q }) => (
        <Pressable onPress={() => onOpen(q.id)} className="mb-2 rounded-lg border border-border bg-card p-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-foreground">{q.customerName || `Quotation #${q.id}`}</Text>
            <Text className="font-semibold text-foreground">{q.total.toFixed(2)}</Text>
          </View>
          <Text className="text-xs text-muted-foreground">
            {q.createdAt ? new Date(q.createdAt).toLocaleString() : ''}
            {q.customerPhone ? ` · ${q.customerPhone}` : ''}
          </Text>
        </Pressable>
      )}
    />
  );
}
