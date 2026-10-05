'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';

// Per-row on/off toggle. Codes are never deleted (orders reference them for
// reporting) - switching one off is how a campaign is ended early.
export function PromoActiveSwitch({ id, code, active }: { id: number; code: string; active: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(active);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: boolean) {
    setSaving(true);
    setChecked(next);
    try {
      const response = await clientFetch(`/api/payload/promo-codes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setChecked(!next);
        toast.error(errorMessageFrom(body, 'Failed to update promo code'));
        return;
      }
      toast.success(next ? `${code} switched on` : `${code} switched off`);
      router.refresh();
    } catch (err) {
      setChecked(!next);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Switch
      checked={checked}
      disabled={saving}
      onCheckedChange={handleChange}
      aria-label={checked ? `Switch off ${code}` : `Switch on ${code}`}
    />
  );
}

export function CopyShareTextButton({ text }: { text: string }) {
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Share text copied', { description: text });
    } catch {
      toast.error('Could not copy - your browser blocked clipboard access.');
    }
  }

  return (
    <Button variant="ghost" size="lg" onClick={handleCopy} title={text}>
      <Copy data-icon="inline-start" />
      <span className="hidden md:inline">Copy share text</span>
      <span className="md:hidden">Share</span>
    </Button>
  );
}
