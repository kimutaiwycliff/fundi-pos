import { useState } from 'react';
import { View } from 'react-native';
import type { PayloadUser } from '../lib/auth';
import { QuotationListScreen } from './QuotationListScreen';
import { NewQuotationScreen } from './NewQuotationScreen';
import { QuotationDetailScreen } from './QuotationDetailScreen';

type View_ = { tab: 'list' } | { tab: 'new' } | { tab: 'detail'; id: number };

// Lightweight state-machine, same shape as restock/RestockHomeScreen.tsx -
// no react-navigation stack needed for a section this small. Starts on the
// list (unlike Restock, which defaults to its "New" tab) since the spec
// calls for a "New quotation" button/header action pushing into the
// builder, not a persistent tab.
export function QuotationsHomeScreen({ user, payloadToken, storeId }: { user: PayloadUser; payloadToken: string; storeId: number | null }) {
  const [view, setView] = useState<View_>({ tab: 'list' });

  return (
    <View className="flex-1">
      {view.tab === 'list' ? (
        <QuotationListScreen payloadToken={payloadToken} onOpen={(id) => setView({ tab: 'detail', id })} onNew={() => setView({ tab: 'new' })} />
      ) : null}
      {view.tab === 'new' ? (
        <NewQuotationScreen
          user={user}
          payloadToken={payloadToken}
          storeId={storeId}
          onCreated={(id) => setView({ tab: 'detail', id })}
          onCancel={() => setView({ tab: 'list' })}
        />
      ) : null}
      {view.tab === 'detail' ? <QuotationDetailScreen payloadToken={payloadToken} quotationId={view.id} onBack={() => setView({ tab: 'list' })} /> : null}
    </View>
  );
}
