import { useEffect, useMemo, useState } from 'react';
import { CUSTOMER_SOURCES, CUSTOMER_SOURCE_LABELS, normalizeKenyanPhone, type CustomerSource } from '@hardware-pos/business-logic';
import { API_BASE_URL, apiFetch } from './auth';
import { useToast } from './Toast';

export interface LocalCustomer {
  id: string;
  name: string;
  phone: string | null;
  /** Customers.loyaltyPoints - redeemable at checkout (see Till.tsx). */
  loyaltyPoints: number;
}

function toLocalCustomer(c: { id: number | string; name: string; phone?: string | null; loyaltyPoints?: number | null }): LocalCustomer {
  return { id: String(c.id), name: c.name, phone: c.phone ?? null, loyaltyPoints: Number(c.loyaltyPoints ?? 0) || 0 };
}

interface CustomerPickerProps {
  tenantId: number;
  payloadToken: string;
  value: LocalCustomer | null;
  onChange: (customer: LocalCustomer | null) => void;
  /** Bump to re-fetch the customer list (e.g. after a sale changed someone's loyalty points). */
  reloadKey?: number;
}

// Optional for every sale (loyalty points, "how did you hear about us"), and
// required for credit ("pay later") sales - otherwise there's no one to
// collect from. Customers are fetched in bulk once
// (mirroring apps/web's own customer picker - GET /api/customers?sort=name&
// limit=1000, then client-side name/phone filtering, rather than a
// server round trip per keystroke) instead of the local `customers` table
// query this used to run against PowerSync's synced data. A brand new
// customer is still created with a direct online call to Payload's own REST
// API (apps/api, not the web app's proxy - the till talks to apps/api
// directly, same as every other apiFetch call in this file/module).
export function CustomerPicker({ payloadToken, value, onChange, reloadKey = 0 }: CustomerPickerProps) {
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // True while a (re)load is in flight. After a sale (reloadKey bump) the old
  // list holds stale loyalty points, so nobody can be picked from it until
  // the fresh list arrives - otherwise "Redeem points" could offer points the
  // customer no longer has.
  const [refreshing, setRefreshing] = useState(true);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  // "How did you hear about us?" - optional, '' = not asked/unknown.
  const [newSource, setNewSource] = useState<CustomerSource | ''>('');
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    let active = true;
    setRefreshing(true);
    apiFetch(`${API_BASE_URL}/api/customers?sort=name&limit=1000&depth=0`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load customers (HTTP ${res.status})`);
        const body = await res.json().catch(() => null);
        const docs = (body?.docs ?? []) as Array<{ id: number | string; name: string; phone: string | null; loyaltyPoints?: number | null }>;
        if (active) {
          setCustomers(docs.map(toLocalCustomer));
          setLoadError(null);
        }
      })
      .catch((err) => {
        // Keep whatever list we had - the server re-checks any redemption
        // against the real balance, so a stale list can't over-redeem.
        if (active) setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [payloadToken, reloadKey]);

  const trimmed = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!trimmed || refreshing) return [];
    return customers
      .filter((c) => c.name.toLowerCase().includes(trimmed) || c.phone?.toLowerCase().includes(trimmed))
      .slice(0, 10);
  }, [customers, trimmed, refreshing]);

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
        body: JSON.stringify({ name: query.trim(), phone: normalizedPhone, ...(newSource ? { source: newSource } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body?.errors?.[0]?.message ?? 'Failed to add customer - are you online?', 'error');
        return;
      }
      const doc = body.doc ?? body;
      const created: LocalCustomer = toLocalCustomer(doc);
      setCustomers((prev) => [...prev, created]);
      onChange(created);
      showToast('Customer added', 'success');
      setCreating(false);
      setQuery('');
      setNewPhone('');
      setNewSource('');
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
          {` · ${value.loyaltyPoints} pts`}
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
      {refreshing && query.trim() ? <p className="pane-empty-state-hint">Loading customers...</p> : null}
      {query.trim() && !refreshing && results.length === 0 && !creating && (
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
          <select
            aria-label="How did you hear about us?"
            value={newSource}
            onChange={(e) => setNewSource(e.currentTarget.value as CustomerSource | '')}
          >
            <option value="">How did you hear about us? (optional)</option>
            {CUSTOMER_SOURCES.map((source) => (
              <option key={source} value={source}>
                {CUSTOMER_SOURCE_LABELS[source]}
              </option>
            ))}
          </select>
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
