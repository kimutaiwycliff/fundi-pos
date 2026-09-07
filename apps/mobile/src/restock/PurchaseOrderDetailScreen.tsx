import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { PayloadUser } from '../lib/auth';
import { fetchPurchaseOrder, deletePurchaseOrder, receivePurchaseOrder, type PurchaseOrderDetail } from './purchaseOrders';
import { buildRestockListHtml } from './restockListHtml';

// Mirrors web's [id]/page.tsx + receive-checklist.tsx: same tick-which-
// items-actually-arrived flow, same draft-only delete, same
// receivedQuantity/partially_received server contract.
export function PurchaseOrderDetailScreen({
  user,
  payloadToken,
  poId,
  onDeleted,
  onBack,
}: {
  user: PayloadUser;
  payloadToken: string;
  poId: number;
  onDeleted: () => void;
  onBack: () => void;
}) {
  const canSeeCost = user.role === 'owner';
  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetchPurchaseOrder(payloadToken, poId).then((doc) => {
      if (!doc) return;
      setPo(doc);
      const outstanding: Record<number, string> = {};
      const check: Record<number, boolean> = {};
      doc.lineItems.forEach((l, index) => {
        const remaining = l.quantity - (l.receivedQuantity ?? 0);
        outstanding[index] = String(remaining);
        check[index] = remaining > 0;
      });
      setQuantities(outstanding);
      setChecked(check);
    });
  };

  useEffect(load, [payloadToken, poId]);

  if (!po) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-muted-foreground">Loading...</Text>
      </View>
    );
  }

  const storeName = typeof po.store === 'object' ? po.store.name : `Store #${po.store}`;
  const supplierName = typeof po.supplier === 'object' ? po.supplier.name : `#${po.supplier}`;

  async function handleDelete() {
    Alert.alert('Delete this draft?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const ok = await deletePurchaseOrder(payloadToken, poId);
          if (ok) onDeleted();
          else Alert.alert('Could not delete restock list');
        },
      },
    ]);
  }

  async function handleConfirmReceipt() {
    if (!po) return;
    const items = po.lineItems
      .map((_, index) => ({ index, quantity: Number(quantities[index]) || 0 }))
      .filter((i) => checked[i.index] && i.quantity > 0);
    if (items.length === 0) {
      Alert.alert('Tick at least one item to receive');
      return;
    }
    setBusy(true);
    const updated = await receivePurchaseOrder(payloadToken, poId, items);
    setBusy(false);
    if (!updated) {
      Alert.alert('Could not confirm receipt');
      return;
    }
    Alert.alert('Receipt confirmed', 'Stock levels updated.');
    load();
  }

  async function handleGenerateDocument() {
    if (!po) return;
    const estimatedTotal = canSeeCost ? po.lineItems.reduce((sum, l) => sum + l.quantity * l.unitCost, 0) : null;
    const html = buildRestockListHtml(
      {
        poNumber: `PO-${po.id}`,
        storeName,
        supplierName,
        createdAtLabel: new Date(po.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        lines: po.lineItems.map((l) => ({
          productName: l.product?.name ?? `#${l.product}`,
          variantLabel: l.variant ? (l.product?.variants?.find((v) => v.id === l.variant)?.label ?? null) : null,
          quantity: l.quantity,
          unitCost: canSeeCost ? l.unitCost : null,
        })),
        estimatedTotal,
      },
      { name: user.name ?? user.email },
    );
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share restock list' });
  }

  const outstandingLines = po.lineItems
    .map((l, index) => ({ index, label: l.product?.name ?? `#${l.product}`, outstanding: l.quantity - (l.receivedQuantity ?? 0) }))
    .filter((l) => l.outstanding > 0);

  return (
    <FlatList
      className="flex-1 bg-background px-4 pt-3"
      data={po.lineItems}
      keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={
        <View className="gap-2 pb-3">
          <Pressable onPress={onBack}>
            <Text className="text-sm text-muted-foreground">← Back</Text>
          </Pressable>
          <Text className="text-lg font-semibold text-foreground">Restock list #{po.id}</Text>
          <Text className="text-sm text-muted-foreground">
            {storeName} · {supplierName} · {po.status.replace('_', ' ')}
          </Text>
        </View>
      }
      renderItem={({ item: l, index }) => (
        <View className="mb-2 flex-row items-center justify-between rounded-lg border border-border bg-card p-3">
          <Text className="flex-1 text-foreground">{l.product?.name ?? `#${l.product}`}</Text>
          <Text className="text-sm text-muted-foreground">
            {l.quantity}
            {canSeeCost ? ` × ${l.unitCost.toFixed(2)}` : ''}
          </Text>
        </View>
      )}
      ListFooterComponent={
        <View className="gap-3 pb-8 pt-2">
          <View className="flex-row gap-2">
            <Pressable onPress={handleGenerateDocument} className="flex-1 items-center rounded-lg border border-border py-3">
              <Text className="text-foreground">Generate document</Text>
            </Pressable>
            {po.status === 'draft' ? (
              <Pressable onPress={handleDelete} className="flex-1 items-center rounded-lg border border-destructive py-3">
                <Text className="text-destructive">Delete draft</Text>
              </Pressable>
            ) : null}
          </View>

          {po.status !== 'received' && outstandingLines.length > 0 ? (
            <View className="gap-3 rounded-lg border border-border p-4">
              <Text className="text-sm font-medium text-foreground">Confirm what actually arrived</Text>
              {outstandingLines.map((l) => (
                <View key={l.index} className="flex-row items-center gap-3">
                  <Pressable onPress={() => setChecked((prev) => ({ ...prev, [l.index]: !prev[l.index] }))}>
                    <View className={`size-5 rounded border ${checked[l.index] ? 'border-primary bg-primary' : 'border-border'}`} />
                  </Pressable>
                  <Text className="flex-1 text-sm text-foreground">{l.label}</Text>
                  <TextInput
                    className="w-16 rounded-lg border border-border px-2 py-1 text-center text-foreground"
                    keyboardType="numeric"
                    editable={checked[l.index]}
                    value={quantities[l.index]}
                    onChangeText={(v) => setQuantities((prev) => ({ ...prev, [l.index]: v }))}
                  />
                  <Text className="text-xs text-muted-foreground">of {l.outstanding}</Text>
                </View>
              ))}
              <Pressable onPress={handleConfirmReceipt} disabled={busy} className="items-center rounded-lg bg-primary py-3">
                <Text className="font-medium text-primary-foreground">{busy ? 'Confirming...' : 'Confirm receipt'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      }
    />
  );
}
