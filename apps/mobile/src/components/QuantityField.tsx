import { useEffect, useState } from 'react';
import { TextInput } from 'react-native';

// Tap the quantity number to type an exact amount, rather than tapping +/−
// one unit at a time - a real gap for a hardware/electrical shop selling
// 20-50 units of a small item. Needs its own local draft state (a plain
// FlatList renderItem callback can't hold hooks), synced back to the real
// quantity whenever it changes from elsewhere (e.g. +/− steppers), and only
// committed on blur/submit - never on every keystroke, since a briefly-
// cleared field would otherwise call onChange(0), which every caller here
// treats as "remove this line" (SellScreen's updateQuantity,
// NewQuotationScreen's updateQuantity), risking losing the line while the
// cashier is mid-type clearing the field to type a new number.
//
// Extracted out of SellScreen.tsx (where this originated) so
// NewQuotationScreen.tsx can share the exact same safe behavior instead of
// its own previous commit-every-keystroke input.
export function QuantityField({ quantity, onChange }: { quantity: number; onChange: (next: number) => void }) {
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(String(quantity));
  }, [quantity]);

  function commit() {
    const next = Number(draft);
    if (Number.isFinite(next) && next > 0 && next !== quantity) {
      onChange(next);
    } else {
      setDraft(String(quantity));
    }
  }

  return (
    <TextInput
      className="w-12 text-center text-foreground"
      keyboardType="number-pad"
      value={draft}
      onChangeText={setDraft}
      onEndEditing={commit}
      onSubmitEditing={commit}
      selectTextOnFocus
    />
  );
}
