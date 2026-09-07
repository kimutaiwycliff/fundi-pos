import { useEffect, useState } from 'react';
import { Text, Pressable, FlatList } from 'react-native';
import { fetchPurchaseOrders, type PurchaseOrderListItem } from './purchaseOrders';

const STATUS_LABEL: Record<PurchaseOrderListItem['status'], string> = {
  draft: 'draft',
  sent: 'sent',
  partially_received: 'partially received',
  received: 'received',
};

export function PurchaseOrderListScreen({ payloadToken, onOpen }: { payloadToken: string; onOpen: (id: number) => void }) {
  const [orders, setOrders] = useState<PurchaseOrderListItem[]>([]);

  useEffect(() => {
    fetchPurchaseOrders(payloadToken).then(setOrders);
  }, [payloadToken]);

  return (
    <FlatList
      className="flex-1 bg-background px-4 pt-3"
      data={orders}
      keyExtractor={(po) => String(po.id)}
      ListEmptyComponent={<Text className="text-sm text-muted-foreground">No restock lists yet.</Text>}
      renderItem={({ item: po }) => (
        <Pressable onPress={() => onOpen(po.id)} className="mb-2 rounded-lg border border-border bg-card p-3">
          <Text className="text-foreground">{typeof po.store === 'object' ? po.store.name : `Store #${po.store}`}</Text>
          <Text className="text-xs text-muted-foreground">
            {typeof po.supplier === 'object' ? po.supplier.name : `#${po.supplier}`} · {po.lineItems.length} item(s) ·{' '}
            {STATUS_LABEL[po.status]}
          </Text>
        </Pressable>
      )}
    />
  );
}
