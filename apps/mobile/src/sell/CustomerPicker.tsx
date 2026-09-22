import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMutedPlaceholderColor } from '../lib/theme';
import { View, Text, TextInput, Pressable, FlatList, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { API_BASE_URL, apiFetch } from '../lib/auth';
import { showAlert } from '../components/AppNotice';

export interface LocalCustomer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface RawCustomer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
}

function mapCustomer(c: RawCustomer): LocalCustomer {
  return { id: String(c.id), name: c.name, phone: c.phone ?? null, email: c.email ?? null };
}

// Credit ("pay later") sales must be tied to a known customer. Existing
// customers are searched via a plain REST fetch of the whole tenant's
// customer list (this app is online-only now - there is no local database
// to query) - fetched once per mount, fuzzy-matched client-side same as
// SellScreen's own product search. A brand new customer requires
// connectivity too, same as apps/web/.../sell/customer-picker.tsx's create
// flow, via Payload's auto-generated REST endpoint for the `customers`
// collection.
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
  const [creating, setCreating] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const [catalog, setCatalog] = useState<LocalCustomer[]>([]);

  // One-shot fetch of the whole tenant's customer list on mount - re-fetches
  // whenever this component itself remounts (e.g. the tender toggles back to
  // credit), which is close enough to "kept fresh" for a picker that's only
  // open for a few seconds at a time.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/customers?where[tenant][equals]=${tenantId}&sort=name&limit=2000`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        setCatalog(((body?.docs ?? []) as RawCustomer[]).map(mapCustomer));
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [payloadToken, tenantId]);

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
      const res = await apiFetch(`${API_BASE_URL}/api/customers`, {
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

  // No `style={{ flex: 1 }}` here (unlike this app's other KeyboardAvoidingView
  // usages) - this component is nested inside SellScreen's absolutely-
  // positioned, content-sized cart sheet with no flex:1 ancestor in between,
  // the exact "maxHeight-bound, not flex-bound" shape SalesScreen's own
  // receipt FlatList note already warns can measure to zero height. Leaving
  // the style unset keeps this hugging its content exactly as the plain
  // View it replaces did, while still letting the keyboard push the
  // create-customer fields below into view.
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
    </KeyboardAvoidingView>
  );
}
