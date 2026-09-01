import { useEffect, useState } from 'react';
import { useMutedPlaceholderColor } from '../lib/theme';
import { View, Text, TextInput, Pressable } from 'react-native';
import { API_BASE_URL } from '../lib/auth';

interface Tenant {
  id: number;
  name: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
}

// Owner-only, mirrors apps/web/.../settings/settings-form.tsx. Business
// name and receipt header/footer both sync down to the till offline (see
// schema.ts's tenants table) - this screen is only where they're edited,
// which requires connectivity.
export function SettingsScreen({ payloadToken, tenantId }: { payloadToken: string; tenantId: number }) {
  const placeholderColor = useMutedPlaceholderColor();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [name, setName] = useState('');
  const [receiptHeader, setReceiptHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/tenants/${tenantId}`, { headers: { Authorization: `JWT ${payloadToken}` } })
      .then((r) => r.json())
      .then((doc: Tenant) => {
        setTenant(doc);
        setName(doc.name);
        setReceiptHeader(doc.receiptHeader ?? '');
        setReceiptFooter(doc.receiptFooter ?? '');
      });
  }, [payloadToken, tenantId]);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`${API_BASE_URL}/api/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({ name, receiptHeader: receiptHeader || null, receiptFooter: receiptFooter || null }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.errors?.[0]?.message ?? 'Failed to save settings');
      setBusy(false);
      return;
    }
    setBusy(false);
    setSaved(true);
  }

  if (!tenant) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">Loading...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 gap-3 bg-background p-4">
      <Text className="text-sm text-muted-foreground">Business name</Text>
      <TextInput className="rounded-lg border border-border bg-card px-3 py-2 text-foreground" value={name} onChangeText={setName} />

      <Text className="mt-2 text-sm text-muted-foreground">Receipt header (below the business name)</Text>
      <TextInput
        className="min-h-16 rounded-lg border border-border bg-card px-3 py-2 text-foreground"
        multiline
        placeholder={'e.g. Westlands, Nairobi\n0700 000 000'}
        placeholderTextColor={placeholderColor}
        value={receiptHeader}
        onChangeText={setReceiptHeader}
      />

      <Text className="mt-2 text-sm text-muted-foreground">Receipt footer (bottom of the receipt)</Text>
      <TextInput
        className="min-h-16 rounded-lg border border-border bg-card px-3 py-2 text-foreground"
        multiline
        placeholder="e.g. Thank you for your business!"
        placeholderTextColor={placeholderColor}
        value={receiptFooter}
        onChangeText={setReceiptFooter}
      />

      {error ? <Text className="text-destructive">{error}</Text> : null}
      {saved ? <Text className="text-primary">Settings saved</Text> : null}

      <Pressable android_ripple={{ color: '#ffffff40' }} className={`mt-2 items-center rounded-lg bg-primary py-3 ${busy ? 'opacity-50' : 'active:opacity-80'}`} disabled={busy} onPress={handleSubmit}>
        <Text className="font-medium text-primary-foreground">{busy ? 'Saving...' : 'Save settings'}</Text>
      </Pressable>
    </View>
  );
}
