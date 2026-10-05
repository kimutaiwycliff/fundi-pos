'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from './format';

// platformNotes: internal only - the API never lets the tenant read it.
export function NotesForm({ tenantId, notes }: { tenantId: number; notes: string | null }) {
  const router = useRouter();
  const [saved, setSaved] = useState(notes ?? '');
  const [value, setValue] = useState(saved);
  const [saving, setSaving] = useState(false);
  const dirty = value !== saved;

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch(`/api/platform/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformNotes: value.trim() || null }),
    });
    setSaving(false);
    if (!response.ok) {
      toast.error(await apiErrorMessage(response, 'Failed to save notes'));
      return;
    }
    setSaved(value);
    toast.success('Notes saved');
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-2">
      <Label htmlFor="platform-notes" className="sr-only">
        Internal notes
      </Label>
      <Textarea
        id="platform-notes"
        rows={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. Agreed 20% discount until March. Prefers calls after 6pm. Pays via the shop's Till number."
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Only platform admins can see these.</span>
        <Button type="submit" size="sm" disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save notes'}
        </Button>
      </div>
    </form>
  );
}
