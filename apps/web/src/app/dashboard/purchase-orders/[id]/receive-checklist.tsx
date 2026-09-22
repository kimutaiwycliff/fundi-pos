'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface ReceiveChecklistLine {
  index: number;
  label: string;
  outstanding: number;
}

// Lets a delivery be receive()'d in parts - each line defaults CHECKED with
// its full outstanding quantity, but a short delivery just means unticking
// (or reducing the quantity of) whatever didn't actually show up; the rest
// stays outstanding for a later receive pass, since receivedQuantity
// accumulates server-side rather than resetting. Plain native checkbox
// input rather than a shadcn Checkbox component, since none exists yet in
// this project and one isn't worth adding for a single use site.
export function ReceiveChecklist({ poId, lines }: { poId: number; lines: ReceiveChecklistLine[] }) {
  const router = useRouter();
  const [checked, setChecked] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(lines.map((l) => [l.index, true])),
  );
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.index, String(l.outstanding)])),
  );
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    const items = lines
      .filter((l) => checked[l.index])
      .map((l) => ({ index: l.index, quantity: Number(quantities[l.index]) || 0 }))
      .filter((i) => i.quantity > 0);

    if (items.length === 0) {
      toast.error('Tick at least one item to receive');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/payload/purchase-orders/${poId}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) throw new Error('Failed to confirm receipt');
      toast.success('Receipt confirmed - stock levels updated');
      router.refresh();
    } catch {
      toast.error('Could not confirm receipt');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Confirm what actually arrived</p>
      {lines.map((l) => (
        <div key={l.index} className="flex items-center gap-3">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={checked[l.index] ?? false}
            onChange={(e) => setChecked((prev) => ({ ...prev, [l.index]: e.target.checked }))}
          />
          <span className="min-w-0 flex-1 truncate text-sm">{l.label}</span>
          <Input
            type="number"
            className="w-20"
            disabled={!checked[l.index]}
            value={quantities[l.index]}
            onChange={(e) => setQuantities((prev) => ({ ...prev, [l.index]: e.target.value }))}
          />
          <span className="text-xs text-muted-foreground">of {l.outstanding}</span>
        </div>
      ))}
      <Button onClick={handleConfirm} disabled={saving}>
        {saving ? 'Confirming...' : 'Confirm receipt'}
      </Button>
    </div>
  );
}
