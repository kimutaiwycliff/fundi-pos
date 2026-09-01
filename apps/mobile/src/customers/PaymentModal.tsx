import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { API_BASE_URL, type PayloadUser } from '../lib/auth';
import { findManagerAndCheckPinLocally, recordCreditPayment } from '../lib/pin';

export interface LocalOrder {
  id: string;
  total: number;
  created_at: string | null;
  synced_at: string | null;
}

interface CreditPaymentRecord {
  id: string;
  amount: number;
  method: 'cash' | 'mpesa' | 'card' | 'other';
  paidAt: string;
}

const METHOD_OPTIONS: Array<{ value: CreditPaymentRecord['method']; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

// Records one installment against a credit sale (POST /api/orders/:id/
// record-payment). Amount defaults to the full outstanding balance, so
// submitting as-is settles the order in full - same unification as
// apps/web/.../sales/credit-payment-dialog.tsx, which replaced a separate
// one-click "mark as settled" button with this same form for exactly that
// reason (most tabs are paid off gradually, not in one visit).
//
// credit-payments isn't part of the synced PowerSync schema (see schema.ts)
// - this fetches payment history live from the server every time it opens,
// consistent with the plan's "credit-settlement requires connectivity"
// decision (same as shifts/void-refund).
export function PaymentModal({
  order,
  user,
  payloadToken,
  onClose,
  onRecorded,
}: {
  order: LocalOrder | null;
  user: PayloadUser;
  payloadToken: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const isSelfManager = user.role === 'owner' || user.role === 'manager';

  const [payments, setPayments] = useState<CreditPaymentRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<CreditPaymentRecord['method']>('cash');
  const [note, setNote] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPayments([]);
      return;
    }
    let active = true;
    setLoadingHistory(true);
    setMethod('cash');
    setNote('');
    setManagerPhone('');
    setManagerPin('');
    setError(null);
    fetch(`${API_BASE_URL}/api/credit-payments?where[order][equals]=${order.id}&sort=paidAt&limit=100`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    })
      .then((r) => r.json())
      .then((body) => {
        if (!active) return;
        const docs = (body?.docs ?? []) as CreditPaymentRecord[];
        setPayments(docs);
        const paid = docs.reduce((sum, p) => sum + p.amount, 0);
        const balance = Math.max(0, Math.round((order.total - paid) * 100) / 100);
        setAmount(String(balance));
      })
      .catch(() => {
        if (active) setPayments([]);
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => {
      active = false;
    };
  }, [order, payloadToken]);

  const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = order ? Math.max(0, Math.round((order.total - amountPaid) * 100) / 100) : 0;

  async function handleSubmit() {
    if (!order) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let managerId = user.id;
      let pin = '';
      if (!isSelfManager) {
        const localCheck = await findManagerAndCheckPinLocally(managerPhone, managerPin);
        if (!localCheck || !localCheck.valid) {
          setError('Manager PIN incorrect');
          setBusy(false);
          return;
        }
        managerId = localCheck.managerId;
        pin = managerPin;
      }
      const result = await recordCreditPayment(payloadToken, order.id, parsed, method, note.trim() || undefined, managerId, pin);
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      onRecorded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={order != null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable className="max-h-[85%] rounded-t-2xl bg-background p-4" onPress={(e) => e.stopPropagation()}>
          <ScrollView>
            <Text className="mb-3 text-lg font-semibold text-foreground">Record payment — order #{order?.id.slice(0, 8)}</Text>

            <View className="flex-row justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
              <View>
                <Text className="text-xs text-muted-foreground">Total</Text>
                <Text className="font-medium text-foreground">{order?.total.toFixed(2)}</Text>
              </View>
              <View>
                <Text className="text-xs text-muted-foreground">Paid so far</Text>
                <Text className="font-medium text-foreground">{loadingHistory ? '…' : amountPaid.toFixed(2)}</Text>
              </View>
              <View>
                <Text className="text-xs text-muted-foreground">Balance</Text>
                <Text className="font-semibold text-foreground">{loadingHistory ? '…' : balance.toFixed(2)}</Text>
              </View>
            </View>

            {payments.length > 0 ? (
              <View className="mt-3 rounded-lg border border-border">
                {payments.map((p) => (
                  <View key={p.id} className="flex-row justify-between border-b border-border px-3 py-1.5 last:border-b-0">
                    <Text className="text-xs text-muted-foreground">{new Date(p.paidAt).toLocaleDateString()}</Text>
                    <Text className="text-xs text-muted-foreground">{METHOD_OPTIONS.find((m) => m.value === p.method)?.label}</Text>
                    <Text className="text-xs font-medium text-foreground">{p.amount.toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Text className="mb-1 mt-4 text-sm text-muted-foreground">Amount</Text>
            <TextInput
              className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />

            <Text className="mb-1 mt-3 text-sm text-muted-foreground">Method</Text>
            <View className="flex-row gap-1.5">
              {METHOD_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  className={`flex-1 items-center rounded-md border py-2 ${method === option.value ? 'border-primary bg-primary' : 'border-border'}`}
                  onPress={() => setMethod(option.value)}
                >
                  <Text className={method === option.value ? 'font-medium text-primary-foreground' : 'text-foreground'}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text className="mb-1 mt-3 text-sm text-muted-foreground">Note (optional)</Text>
            <TextInput className="rounded-lg border border-border bg-card px-3 py-2 text-foreground" value={note} onChangeText={setNote} />

            {!isSelfManager ? (
              <View className="mt-4 gap-2 rounded-lg border border-border p-3">
                <Text className="text-sm font-medium text-foreground">Manager authorization required</Text>
                <TextInput
                  className="rounded-md border border-border bg-card px-3 py-2 text-foreground"
                  placeholder="Manager phone"
                  placeholderTextColor="#6e605a"
                  keyboardType="phone-pad"
                  value={managerPhone}
                  onChangeText={setManagerPhone}
                />
                <TextInput
                  className="rounded-md border border-border bg-card px-3 py-2 text-foreground"
                  placeholder="Manager PIN"
                  placeholderTextColor="#6e605a"
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={6}
                  value={managerPin}
                  onChangeText={setManagerPin}
                />
              </View>
            ) : null}

            {error ? <Text className="mt-3 text-destructive">{error}</Text> : null}

            <Pressable
              className={`mt-4 items-center rounded-lg bg-primary py-3 ${busy ? 'opacity-50' : 'active:opacity-80'}`}
              disabled={busy}
              onPress={handleSubmit}
            >
              <Text className="font-medium text-primary-foreground">
                {busy ? 'Recording...' : Number(amount) >= balance ? 'Record & settle in full' : 'Record payment'}
              </Text>
            </Pressable>
            <Pressable className="mt-2 items-center py-2" onPress={onClose}>
              <Text className="text-muted-foreground">Cancel</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
