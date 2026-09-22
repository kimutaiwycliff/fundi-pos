import { useEffect, useMemo, useState } from 'react';
import { normalizeKenyanPhone } from '@hardware-pos/business-logic';
import { API_BASE_URL, apiFetch } from './auth';
import { useToast } from './Toast';

export interface LocalCustomer {
  id: string;
  name: string;
  phone: string | null;
}

interface CustomerPickerProps {
  tenantId: number;
  payloadToken: string;
  value: LocalCustomer | null;
  onChange: (customer: LocalCustomer | null) => void;
}

// Credit ("pay later") sales must be tied to a known customer - otherwise
// there's no one to collect from. Customers are fetched in bulk once
// (mirroring apps/web's own customer picker - GET /api/customers?sort=name&
// limit=1000, then client-side name/phone filtering, rather than a
// server round trip per keystroke) instead of the local `customers` table
// query this used to run against PowerSync's synced data. A brand new
// customer is still created with a direct online call to Payload's own REST
// API (apps/api, not the web app's proxy - the till talks to apps/api
// directly, same as every other apiFetch call in this file/module).
export function CustomerPicker({ payloadToken, value, onChange }: CustomerPickerProps) {
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    let active = true;
    apiFetch(`${API_BASE_URL}/api/customers?sort=name&limit=1000&depth=0`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load customers (HTTP ${res.status})`);
        const body = await res.json().catch(() => null);
        const docs = (body?.docs ?? []) as Array<{ id: number | string; name: string; phone: string | null }>;
        if (active) setCustomers(docs.map((c) => ({ id: String(c.id), name: c.name, phone: c.phone ?? null })));
      })
      .catch((err) => {
        if (active) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [payloadToken]);

  const trimmed = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!trimmed) return [];
    return customers
      .filter((c) => c.name.toLowerCase().includes(trimmed) || c.phone?.toLowerCase().includes(trimmed))
      .slice(0, 10);
  }, [customers, trimmed]);

  async function handleCreate() {
    if (!query.trim()) return;
    const normalizedPhone = normalizeKenyanPhone(newPhone.trim());
    if (!normalizedPhone) {
      showToast('Enter a valid Kenyan phone number, e.g. 0712345678.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
        body: JSON.stringify({ name: query.trim(), phone: normalizedPhone }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body?.errors?.[0]?.message ?? 'Failed to add customer - are you online?', 'error');
        return;
      }
      const doc = body.doc ?? body;
      const created: LocalCustomer = { id: String(doc.id), name: doc.name, phone: doc.phone ?? null };
      setCustomers((prev) => [...prev, created]);
      onChange(created);
      showToast('Customer added', 'success');
      setCreating(false);
      setQuery('');
      setNewPhone('');
    } catch (err) {
      showToast(`Failed to add customer: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (value) {
    return (
      <div className="customer-picker-selected">
        <span>
          Customer: <strong>{value.name}</strong>
          {value.phone ? ` · ${value.phone}` : ''}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="customer-picker">
      <input
        placeholder="Search customer by name or phone..."
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          setCreating(false);
        }}
      />
      {loadError ? <p className="pane-empty-state-hint">{loadError}</p> : null}
      {results.length > 0 && (
        <ul className="customer-picker-results">
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onChange(c)}>
                {c.name} {c.phone ? `(${c.phone})` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && results.length === 0 && !creating && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreating(true)}>
          + Add "{query.trim()}" as a new customer
        </button>
      )}
      {creating && (
        <div className="customer-picker-create">
          <input
            placeholder="Phone e.g. 0712345678"
            value={newPhone}
            onChange={(e) => setNewPhone(e.currentTarget.value)}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleCreate}
            disabled={saving || !newPhone.trim()}
          >
            {saving ? 'Adding...' : 'Add customer'}
          </button>
          <p className="pane-empty-state-hint">Requires an internet connection.</p>
        </div>
      )}
    </div>
  );
}
