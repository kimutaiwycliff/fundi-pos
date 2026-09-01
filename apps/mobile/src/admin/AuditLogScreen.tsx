import { useEffect, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { View, Text, FlatList } from 'react-native';
import { API_BASE_URL } from '../lib/auth';

interface AuditEntry {
  id: number;
  action: string;
  summary: string;
  actor: { email: string } | number;
  createdAt: string;
}

const DESTRUCTIVE_ACTIONS = new Set(['order_voided', 'order_refunded', 'login_blocked', 'staff_banned', 'staff_deleted', 'store_deleted']);

// Read-only, owner/manager only, mirrors apps/web/.../audit-log/page.tsx.
// Not part of the synced PowerSync schema - fetched live each time this
// opens, same as credit-payments (Phase 2's PaymentModal).
export function AuditLogScreen({ payloadToken }: { payloadToken: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/audit-log?sort=-createdAt&limit=200&depth=1`, { headers: { Authorization: `JWT ${payloadToken}` } })
      .then((r) => r.json())
      .then((body) => setEntries(body?.docs ?? []));
  }, [payloadToken]);

  return (
    <View className="flex-1 bg-background">
      <FlatList
        contentContainerClassName="gap-2 p-3"
        data={entries}
        keyExtractor={(e) => String(e.id)}
        ListEmptyComponent={<Text className="mt-8 text-center text-muted-foreground">Nothing logged yet.</Text>}
        renderItem={({ item }) => (
          <Animated.View entering={FadeInDown.duration(200)} className="rounded-lg border border-border bg-card p-3">
            <View className="flex-row items-center justify-between">
              <Text className={`text-xs font-medium ${DESTRUCTIVE_ACTIONS.has(item.action) ? 'text-destructive' : 'text-foreground'}`}>{item.action.replace(/_/g, ' ')}</Text>
              <Text className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
            <Text className="mt-1 text-sm text-foreground">{item.summary}</Text>
            <Text className="mt-1 text-xs text-muted-foreground">by {typeof item.actor === 'object' ? item.actor.email : `#${item.actor}`}</Text>
          </Animated.View>
        )}
      />
    </View>
  );
}
