'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type Store = { id: number; name: string; address: string | null; timezone: string };

export function StoreDialog({ store }: { store?: Store }) {
  const router = useRouter();
  const isEdit = Boolean(store);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: store?.name ?? '',
    address: store?.address ?? '',
    timezone: store?.timezone ?? 'Africa/Nairobi',
  });

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch(isEdit ? `/api/payload/stores/${store!.id}` : '/api/payload/stores', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, address: form.address || null, timezone: form.timezone }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.errors?.[0]?.message ?? `Failed to ${isEdit ? 'update' : 'create'} store`);
      setLoading(false);
      return;
    }

    setOpen(false);
    setLoading(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        ) : (
          <Button>New store</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit store' : 'New store'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" required value={form.name} onChange={update('name')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address">Address</Label>
            <Input id="address" value={form.address} onChange={update('address')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Input id="timezone" required value={form.timezone} onChange={update('timezone')} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create store'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
