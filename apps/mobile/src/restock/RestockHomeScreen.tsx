import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { PayloadUser } from '../lib/auth';
import { RestockScreen } from './RestockScreen';
import { PurchaseOrderListScreen } from './PurchaseOrderListScreen';
import { PurchaseOrderDetailScreen } from './PurchaseOrderDetailScreen';

type View_ = { tab: 'new' } | { tab: 'lists' } | { tab: 'detail'; id: number };

// Simple two-tab switcher (New / My lists) plus a detail drill-in - no
// react-navigation stack needed for a section this small, matches the
// lightweight state-machine style already used elsewhere in this app
// (App.tsx's own login flow).
export function RestockHomeScreen({ user, storeId, payloadToken }: { user: PayloadUser; storeId: number | null; payloadToken: string }) {
  const [view, setView] = useState<View_>({ tab: 'new' });

  return (
    <View className="flex-1">
      {view.tab !== 'detail' ? (
        <View className="flex-row gap-2 border-b border-border px-4 py-2">
          <Pressable onPress={() => setView({ tab: 'new' })} className={`rounded-full px-3 py-1.5 ${view.tab === 'new' ? 'bg-primary' : 'bg-card border border-border'}`}>
            <Text className={view.tab === 'new' ? 'text-primary-foreground' : 'text-foreground'}>New</Text>
          </Pressable>
          <Pressable onPress={() => setView({ tab: 'lists' })} className={`rounded-full px-3 py-1.5 ${view.tab === 'lists' ? 'bg-primary' : 'bg-card border border-border'}`}>
            <Text className={view.tab === 'lists' ? 'text-primary-foreground' : 'text-foreground'}>My lists</Text>
          </Pressable>
        </View>
      ) : null}

      {view.tab === 'new' ? <RestockScreen user={user} storeId={storeId} payloadToken={payloadToken} /> : null}
      {view.tab === 'lists' ? (
        <PurchaseOrderListScreen payloadToken={payloadToken} onOpen={(id) => setView({ tab: 'detail', id })} />
      ) : null}
      {view.tab === 'detail' ? (
        <PurchaseOrderDetailScreen
          user={user}
          payloadToken={payloadToken}
          poId={view.id}
          onBack={() => setView({ tab: 'lists' })}
          onDeleted={() => setView({ tab: 'lists' })}
        />
      ) : null}
    </View>
  );
}
