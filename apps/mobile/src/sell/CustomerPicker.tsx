import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMutedPlaceholderColor } from '../lib/theme';
import { View, Text, TextInput, Pressable, FlatList } from 'react-native';
import { getDb } from '../db/database';
import { API_BASE_URL } from '../lib/auth';
import { showAlert } from '../components/AppNotice';

export interface LocalCustomer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

// Credit ("pay later") sales must be tied to a known customer. Existing
// customers are searched from the locally-synced `customers` table (offline
// - matches apps/desktop's till behavior); a brand new customer requires
// connectivity, same as apps/web/.../sell/customer-picker.tsx's create flow,
// via Payload's auto-generated REST endpoint for the `customers` collection.
export function CustomerPicker({
  payloadToken,
  tenantId,
  value,
  onChange,
}: {
  payloadToken: string;
  tenantId: number;
  value: LocalCustomer | null;
  onChange: (customer: LocalCustomer | null) => void;
}) {
  const placeholderColor = useMutedPlaceholderColor();
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<LocalCustomer[]>([]);
  const [creating, setCreating] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // Whole tenant's customer list loaded once, not per keystroke, so search
  // can fuzzy-match client-side - same pattern as SellScreen's product
  // search (see its own note on why, ported from apps/web's fuzzySearch).
  useEffect(() => {
    let active = true;
    getDb()
      .getAll<LocalCustomer>(`SELECT id, name, phone, email FROM customers WHERE tenant_id = ? ORDER BY name LIMIT 2000`, [tenantId])
      .then((rows) => {
        if (active) setCatalog(rows);
      });
    return () => {
      active = false;
    };
  }, [tenantId]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const fuse = new Fuse(catalog, { threshold: 0.4, ignoreLocation: true, keys: ['name', 'phone'] });
    return fuse.search(trimmed).slice(0, 10).map((r) => r.item);
  }, [query, catalog]);

  async function handleCreate() {
    if (!query.trim() || !newPhone.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
        body: JSON.stringify({ tenant: tenantId, name: query.trim(), phone: newPhone.trim(), email: newEmail.trim() || null, loyaltyPoints: 0 }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.errors?.[0]?.message ?? 'Failed to add customer');
      }
      const doc = body.doc as { id: number; name: string; phone: string | null; email: string | null };
      onChange({ id: String(doc.id), name: doc.name, phone: doc.phone, email: doc.email });
      setCreating(false);
      setQuery('');
      setNewPhone('');
      setNewEmail('');
    } catch (err) {
      showAlert('Failed to add customer', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (value) {
    return (
      <View className="flex-row items-center justify-between gap-2 rounded-lg border border-border bg-card p-2">
        <Text className="flex-1 text-sm text-foreground">
          Customer: <Text className="font-semibold">{value.name}</Text>
          {value.phone ? ` · ${value.phone}` : ''}
        </Text>
        <Pressable android_ripple={{}} onPress={() => onChange(null)}>
          <Text className="text-sm text-muted-foreground">Change</Text>
        </Pressable>
      </View>
    );
  }

  const trimmed = query.trim();

  return (
    <View className="gap-2">
      <TextInput
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
        placeholder="Search customer by name or phone..."
        placeholderTextColor={placeholderColor}
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setCreating(false);
        }}
      />
      {results.length > 0 ? (
        <View className="rounded-lg border border-border">
          <FlatList
            data={results}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => (
              <Animated.View entering={FadeInDown.duration(180)}>
              <Pressable android_ripple={{}} className="px-3 py-2 active:bg-muted" onPress={() => onChange(item)}>
                <Text className="text-sm text-foreground">
                  {item.name} {item.phone ? `(${item.phone})` : ''}
                </Text>
              </Pressable>
              </Animated.View>
            )}
          />
        </View>
      ) : null}
      {trimmed && results.length === 0 && !creating ? (
        <Pressable android_ripple={{}} className="items-center rounded-md border border-border py-2 active:opacity-70" onPress={() => setCreating(true)}>
          <Text className="text-sm text-foreground">+ Add &quot;{trimmed}&quot; as a new customer</Text>
        </Pressable>
      ) : null}
      {creating ? (
        <View className="gap-2 rounded-lg border border-border p-2">
          <TextInput
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            placeholder="Phone e.g. 0712345678"
            placeholderTextColor={placeholderColor}
            keyboardType="phone-pad"
            value={newPhone}
            onChangeText={setNewPhone}
          />
          <TextInput
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            placeholder="Email (optional, for invoices)"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            keyboardType="email-address"
            value={newEmail}
            onChangeText={setNewEmail}
          />
          <Pressable android_ripple={{ color: '#ffffff40' }}
            className={`items-center rounded-md bg-primary py-2 ${saving || !newPhone.trim() ? 'opacity-50' : 'active:opacity-80'}`}
            onPress={handleCreate}
            disabled={saving || !newPhone.trim()}
          >
            <Text className="text-sm font-medium text-primary-foreground">{saving ? 'Adding...' : 'Add customer'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
