import { useEffect, useState } from 'react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { normalizeKenyanPhone } from '@hardware-pos/business-logic';
import { getDb } from './database';
import { API_BASE_URL } from './auth';
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
// there's no one to collect from. Existing customers come from the
// already-synced local `customers` table (fully offline); a brand new
// customer is created with a direct online call to Payload's own REST API
// (apps/api, not the web app's proxy - the till talks to apps/api directly,
// same as every other tauriFetch call in this file/module) since the till
// has no local write/sync path for reference data like this one
// (src-tauri/src/connector.rs's upload_data_impl explicitly drops any
// customers/products/etc. table changes rather than uploading them).
export function CustomerPicker({ tenantId, payloadToken, value, onChange }: CustomerPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocalCustomer[]>([]);
  const [creating, setCreating] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    let active = true;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const db = getDb();
    db.getAll<LocalCustomer>(
      `SELECT id, name, phone FROM customers WHERE tenant_id = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 10`,
      [tenantId, `%${trimmed}%`, `%${trimmed}%`],
    ).then((rows) => {
      if (active) setResults(rows);
    });
    return () => {
      active = false;
    };
  }, [query, tenantId]);

  async function handleCreate() {
    if (!query.trim()) return;
    const normalizedPhone = normalizeKenyanPhone(newPhone.trim());
    if (!normalizedPhone) {
      showToast('Enter a valid Kenyan phone number, e.g. 0712345678.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await tauriFetch(`${API_BASE_URL}/api/customers`, {
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
      onChange({ id: String(doc.id), name: doc.name, phone: doc.phone ?? null });
      showToast('Customer added', 'success');
      setCreating(false);
      setQuery('');
      setNewPhone('');
      setResults([]);
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
