import { useState } from 'react';
import { useMutedPlaceholderColor } from '../lib/theme';
import { Modal, View, Text, TextInput, Pressable } from 'react-native';
import { findManagerAndCheckPinLocally, authorizeOrderStatusChange } from '../lib/pin';

export interface VoidableOrder {
  id: string;
  total: number;
}

// Void/refund a completed sale - requires connectivity and a manager PIN,
// always re-verified server-side (/api/orders/:id/authorize-status), same
// as apps/desktop/src/VoidOrderPanel.tsx. Unlike PaymentModal's settle
// flow, this endpoint never special-cases an owner/manager's own session -
// it always requires a specific manager identity + PIN in the request body
// (see authorize-status/route.ts: no role branch, unconditional managerId/
// pin requirement) - so the prompt is shown unconditionally here too.
export function VoidRefundModal({
  order,
  payloadToken,
  onClose,
  onDone,
}: {
  order: VoidableOrder | null;
  payloadToken: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const placeholderColor = useMutedPlaceholderColor();
  const [status, setStatus] = useState<'voided' | 'refunded'>('voided');
  const [managerPhone, setManagerPhone] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      const localCheck = await findManagerAndCheckPinLocally(managerPhone, managerPin);
      if (!localCheck || !localCheck.valid) {
        setError('Manager PIN incorrect');
        setBusy(false);
        return;
      }
      const result = await authorizeOrderStatusChange(payloadToken, order.id, status, localCheck.managerId, managerPin);
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={order != null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable android_ripple={{}} className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable android_ripple={{}} className="rounded-t-2xl bg-background p-4" onPress={(e) => e.stopPropagation()}>
          <Text className="mb-3 text-lg font-semibold text-foreground">Void or refund — order #{order?.id.slice(0, 8)}</Text>
          <Text className="mb-3 text-muted-foreground">Total {order?.total.toFixed(2)}. This requires a manager or owner PIN, re-verified by the server.</Text>

          <View className="flex-row gap-1.5">
            <Pressable android_ripple={{ color: '#ffffff40' }}
              className={`flex-1 items-center rounded-md border py-2 ${status === 'voided' ? 'border-primary bg-primary' : 'border-border'}`}
              onPress={() => setStatus('voided')}
            >
              <Text className={status === 'voided' ? 'font-medium text-primary-foreground' : 'text-foreground'}>Void</Text>
            </Pressable>
            <Pressable android_ripple={{ color: '#ffffff40' }}
              className={`flex-1 items-center rounded-md border py-2 ${status === 'refunded' ? 'border-primary bg-primary' : 'border-border'}`}
              onPress={() => setStatus('refunded')}
            >
              <Text className={status === 'refunded' ? 'font-medium text-primary-foreground' : 'text-foreground'}>Refund</Text>
            </Pressable>
          </View>

          <TextInput
            className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-foreground"
            placeholder="Manager phone"
            placeholderTextColor={placeholderColor}
            keyboardType="phone-pad"
            value={managerPhone}
            onChangeText={setManagerPhone}
          />
          <TextInput
            className="mt-2 rounded-lg border border-border bg-card px-3 py-2 text-foreground"
            placeholder="Manager PIN"
            placeholderTextColor={placeholderColor}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
            value={managerPin}
            onChangeText={setManagerPin}
          />

          {error ? <Text className="mt-3 text-destructive">{error}</Text> : null}

          <Pressable android_ripple={{ color: '#ffffff40' }}
            className={`mt-4 items-center rounded-lg bg-destructive py-3 ${busy ? 'opacity-50' : 'active:opacity-80'}`}
            disabled={busy}
            onPress={handleSubmit}
          >
            <Text className="font-medium text-primary-foreground">{busy ? 'Confirming...' : `Confirm ${status}`}</Text>
          </Pressable>
          <Pressable android_ripple={{}} className="mt-2 items-center py-2" onPress={onClose}>
            <Text className="text-muted-foreground">Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
