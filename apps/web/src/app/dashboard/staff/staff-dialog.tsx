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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Store = { id: number; name: string };
type Staff = {
  id: number;
  email: string;
  phone: string | null;
  role: string;
  store: { id: number } | number | null;
};

// One dialog for both add and edit - staff being present is what switches
// the mode. Password/PIN are only sent on edit if the owner actually typed
// something new, so leaving them blank never clobbers an existing
// credential (a fresh scryptSync hash of an empty string would otherwise
// silently lock the person out).
export function StaffDialog({ stores, staff, trigger }: { stores: Store[]; staff?: Staff; trigger: React.ReactNode }) {
  const router = useRouter();
  const isEdit = Boolean(staff);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialStoreId = staff?.store == null ? 'none' : String(typeof staff.store === 'object' ? staff.store.id : staff.store);
  const [form, setForm] = useState({
    email: staff?.email ?? '',
    password: '',
    phone: staff?.phone ?? '',
    role: staff?.role ?? 'cashier',
    storeId: initialStoreId,
    pin: '',
  });

  function update(field: 'email' | 'password' | 'phone' | 'pin') {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const data: Record<string, unknown> = {
      email: form.email,
      phone: form.phone || null,
      role: form.role,
      store: form.storeId === 'none' ? null : Number(form.storeId),
    };
    if (form.password) data.password = form.password;
    if (form.pin) data.pin = form.pin;
    if (!isEdit && !form.password) {
      setError('Password is required');
      setLoading(false);
      return;
    }

    const response = await fetch(isEdit ? `/api/payload/users/${staff!.id}` : '/api/payload/users', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.errors?.[0]?.message ?? `Failed to ${isEdit ? 'update' : 'create'} staff member`);
      setLoading(false);
      return;
    }

    setOpen(false);
    setLoading(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit staff' : 'Add staff'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={form.email} onChange={update('email')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{isEdit ? 'New password (leave blank to keep current)' : 'Password'}</Label>
            <Input id="password" type="password" minLength={8} required={!isEdit} value={form.password} onChange={update('password')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={update('phone')} placeholder="0712345678" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pin">{isEdit ? 'Reset till PIN (leave blank to keep current)' : 'Till PIN'}</Label>
              <Input id="pin" inputMode="numeric" maxLength={6} value={form.pin} onChange={update('pin')} placeholder="4-6 digits" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="store">Store</Label>
              <Select value={form.storeId} onValueChange={(v) => setForm((f) => ({ ...f, storeId: v }))}>
                <SelectTrigger id="store">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All stores</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Add staff'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
