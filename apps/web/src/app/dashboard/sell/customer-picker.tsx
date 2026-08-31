'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CustomerRef } from './page';

// Credit ("pay later") sales must be tied to a known customer. Existing
// customers are filtered in-memory from the already-loaded `customers` list
// (same "load once, filter client-side" convention as product-search.tsx);
// a brand new customer is created via the web proxy, mirroring
// apps/desktop/src/CustomerPicker.tsx's create flow but without its
// offline-only caveat, since the web POS is online-only.
export function CustomerPicker({
  customers,
  value,
  onChange,
  onCreated,
}: {
  customers: CustomerRef[];
  value: CustomerRef | null;
  onChange: (customer: CustomerRef | null) => void;
  onCreated: (customer: CustomerRef) => void;
}) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const trimmed = query.trim().toLowerCase();
  const results = trimmed
    ? customers.filter((c) => c.name.toLowerCase().includes(trimmed) || (c.phone ?? '').includes(trimmed)).slice(0, 10)
    : [];

  async function handleCreate() {
    if (!query.trim() || !newPhone.trim()) return;
    setSaving(true);
    const response = await fetch('/api/payload/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: query.trim(), phone: newPhone.trim(), email: newEmail.trim() || null, loyaltyPoints: 0 }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(body?.errors?.[0]?.message ?? 'Failed to add customer');
      setSaving(false);
      return;
    }
    const doc = body.doc as CustomerRef;
    onCreated(doc);
    onChange(doc);
    toast.success('Customer added');
    setCreating(false);
    setQuery('');
    setNewPhone('');
    setNewEmail('');
    setSaving(false);
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
        <span>
          Customer: <strong>{value.name}</strong>
          {value.phone ? ` · ${value.phone}` : ''}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="Search customer by name or phone..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCreating(false);
        }}
      />
      {results.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border p-1">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c)}
              className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              {c.name} {c.phone ? `(${c.phone})` : ''}
            </button>
          ))}
        </div>
      ) : null}
      {trimmed && results.length === 0 && !creating ? (
        <Button type="button" variant="secondary" size="sm" onClick={() => setCreating(true)}>
          + Add &quot;{query.trim()}&quot; as a new customer
        </Button>
      ) : null}
      {creating ? (
        <div className="flex flex-col gap-2 rounded-lg border p-2">
          <Input placeholder="Phone e.g. 0712345678" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <Input
            type="email"
            placeholder="Email (optional, for invoices)"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <Button type="button" size="sm" onClick={handleCreate} disabled={saving || !newPhone.trim()}>
            {saving ? 'Adding...' : 'Add customer'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
