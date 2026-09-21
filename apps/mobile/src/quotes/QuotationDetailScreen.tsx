import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_BASE_URL } from '../lib/auth';
import { showAlert } from '../components/AppNotice';
import { usePullToRefresh } from '../lib/usePullToRefresh';
import { fetchQuotation, type QuotationDetail } from './quotations';

// Mirrors SalesScreen.tsx's sendInvoiceWhatsApp - the OS share sheet is the
// only way to actually deliver a file to WhatsApp (a wa.me link can only
// pre-fill text). Unlike the invoice, this PDF isn't rendered on-device -
// it already exists server-side (quotations.ts's PDF route), so the flow
// here is fetch-bytes-then-share rather than render-html-then-print:
// File.downloadFileAsync pulls the authenticated PDF straight into a local
// cache file (no manual arrayBuffer/base64 juggling needed), and that
// file's uri is handed to expo-sharing exactly like the invoice PDF is.
export function QuotationDetailScreen({ payloadToken, quotationId, onBack }: { payloadToken: string; quotationId: number; onBack: () => void }) {
  const [quotation, setQuotation] = useState<QuotationDetail | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(() => {
    fetchQuotation(payloadToken, quotationId).then(setQuotation);
  }, [payloadToken, quotationId]);

  useEffect(load, [load]);

  const { refreshing, onRefresh } = usePullToRefresh(load);

  async function handleShareWhatsApp() {
    setSharing(true);
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        showAlert('Sharing is not available on this device');
        return;
      }
      const destination = new File(Paths.cache, `quotation-${quotationId}.pdf`);
      const file = await File.downloadFileAsync(`${API_BASE_URL}/api/quotations/${quotationId}/quotation-pdf`, destination, {
        headers: { Authorization: `JWT ${payloadToken}` },
        idempotent: true,
      });
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Share quotation' });
    } catch (err) {
      showAlert('Could not prepare quotation PDF', err instanceof Error ? err.message : String(err));
    } finally {
      setSharing(false);
    }
  }

  if (!quotation) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-muted-foreground">Loading...</Text>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background px-4 pt-3"
      data={quotation.lineItems}
      keyExtractor={(_, i) => String(i)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#df5102" />}
      ListHeaderComponent={
        <View className="gap-1 pb-3">
          <Pressable onPress={onBack}>
            <Text className="text-sm text-muted-foreground">← Back</Text>
          </Pressable>
          <Text className="text-lg font-semibold text-foreground">Quotation #{quotation.id}</Text>
          <Text className="text-sm text-foreground">{quotation.customerName}</Text>
          {quotation.customerPhone ? <Text className="text-xs text-muted-foreground">{quotation.customerPhone}</Text> : null}
          <Text className="text-xs text-muted-foreground">{quotation.createdAt ? new Date(quotation.createdAt).toLocaleString() : ''}</Text>
          {quotation.notes ? <Text className="mt-2 text-sm text-muted-foreground">{quotation.notes}</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <View className="mb-2 flex-row items-center justify-between rounded-lg border border-border bg-card p-3">
          <View className="shrink flex-1">
            <Text className="text-foreground">{item.label}</Text>
            <Text className="text-xs text-muted-foreground">
              {item.quantity} × {item.unitPrice.toFixed(2)}
            </Text>
          </View>
          <Text className="font-semibold text-foreground">{(item.quantity * item.unitPrice).toFixed(2)}</Text>
        </View>
      )}
      ListFooterComponent={
        <View className="gap-3 pb-8 pt-2">
          <View className="flex-row justify-between border-t border-border pt-3">
            <Text className="font-semibold text-foreground">Total</Text>
            <Text className="font-semibold text-foreground">{quotation.total.toFixed(2)}</Text>
          </View>
          <Pressable
            android_ripple={{ color: '#ffffff40' }}
            className={`items-center rounded-lg bg-primary py-3 ${sharing ? 'opacity-50' : 'active:opacity-80'}`}
            disabled={sharing}
            onPress={handleShareWhatsApp}
          >
            <Text className="font-medium text-primary-foreground">{sharing ? 'Preparing...' : 'Share via WhatsApp'}</Text>
          </Pressable>
        </View>
      }
    />
  );
}
