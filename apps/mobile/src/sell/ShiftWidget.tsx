import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { closeShift, openShift, type Shift } from '../lib/shifts';

// Cash-up reconciliation, mirroring apps/web/.../sell/shift-widget.tsx /
// apps/desktop/src/ShiftPanel.tsx - the server computes expectedCash/
// variance authoritatively from the Orders ledger, never trusted client-
// side. "No sale without an open shift" is a client-side UX gate only here
// too, matching both other surfaces.
export function ShiftWidget({
  payloadToken,
  tenantId,
  storeId,
  terminal,
  cashierId,
  shift,
  onShiftChange,
}: {
  payloadToken: string;
  tenantId: number;
  storeId: number;
  terminal: string;
  cashierId: number;
  shift: Shift | null;
  onShiftChange: (shift: Shift | null) => void;
}) {
  const [openingFloat, setOpeningFloat] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleOpen() {
    setBusy(true);
    try {
      const created = await openShift(payloadToken, { tenantId, storeId, terminal, cashierId, openingFloat: Number(openingFloat) || 0 });
      onShiftChange(created);
      setOpeningFloat('');
    } catch (err) {
      Alert.alert('Failed to open shift', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    if (!shift) return;
    setBusy(true);
    try {
      const closed = await closeShift(payloadToken, shift.id, Number(closingCash) || 0);
      onShiftChange(null);
      setClosingCash('');
      setClosing(false);
      const variance = closed.variance ?? 0;
      Alert.alert(
        'Shift closed',
        `Expected ${(closed.expectedCash ?? 0).toFixed(2)}, variance ${variance >= 0 ? '+' : ''}${variance.toFixed(2)}`,
      );
    } catch (err) {
      Alert.alert('Failed to close shift', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!shift) {
    return (
      <View className="flex-row flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
        <Text className="text-sm text-muted-foreground">No shift open</Text>
        <TextInput
          className="h-8 w-32 rounded-md border border-border bg-card px-2 text-sm text-foreground"
          placeholder="Opening float"
          placeholderTextColor="#6e605a"
          keyboardType="decimal-pad"
          value={openingFloat}
          onChangeText={setOpeningFloat}
        />
        <Pressable
          className={`rounded-md bg-primary px-3 py-1.5 ${busy ? 'opacity-50' : 'active:opacity-80'}`}
          onPress={handleOpen}
          disabled={busy}
        >
          <Text className="text-sm font-medium text-primary-foreground">{busy ? 'Opening...' : 'Open shift'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
      <Text className="text-sm text-foreground">Shift open · float {shift.openingFloat.toFixed(2)}</Text>
      {closing ? (
        <>
          <TextInput
            className="h-8 w-32 rounded-md border border-border bg-card px-2 text-sm text-foreground"
            placeholder="Cash counted"
            placeholderTextColor="#6e605a"
            keyboardType="decimal-pad"
            value={closingCash}
            onChangeText={setClosingCash}
          />
          <Pressable
            className={`rounded-md bg-destructive px-3 py-1.5 ${busy ? 'opacity-50' : 'active:opacity-80'}`}
            onPress={handleClose}
            disabled={busy}
          >
            <Text className="text-sm font-medium text-primary-foreground">{busy ? 'Closing...' : 'Confirm close'}</Text>
          </Pressable>
          <Pressable className="px-2 py-1.5" onPress={() => setClosing(false)}>
            <Text className="text-sm text-muted-foreground">Cancel</Text>
          </Pressable>
        </>
      ) : (
        <Pressable className="rounded-md border border-border px-3 py-1.5 active:opacity-70" onPress={() => setClosing(true)}>
          <Text className="text-sm text-foreground">Close shift</Text>
        </Pressable>
      )}
    </View>
  );
}
