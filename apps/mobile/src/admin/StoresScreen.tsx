import { useEffect, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMutedPlaceholderColor } from '../lib/theme';
import { View, Text, TextInput, Pressable, FlatList, Modal, Alert } from 'react-native';
import { API_BASE_URL } from '../lib/auth';

interface StoreRow {
  id: number;
  name: string;
  address: string | null;
  timezone: string;
}

// Owner/manager only, mirrors apps/web/.../stores/*.tsx. Delete stays
// blocked server-side if a branch has order/shift/audit history (same
// beforeDelete guard pattern as Users.ts) - surfaced here verbatim rather
// than re-implemented client-side.
export function StoresScreen({ payloadToken, tenantId }: { payloadToken: string; tenantId: number }) {
  const placeholderColor = useMutedPlaceholderColor();
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [editing, setEditing] = useState<StoreRow | 'new' | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState('Africa/Nairobi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    fetch(`${API_BASE_URL}/api/stores?where[tenant][equals]=${tenantId}&sort=name&limit=100`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    })
      .then((r) => r.json())
      .then((body) => setStores(body?.docs ?? []));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editing == null) return;
    const store = editing === 'new' ? null : editing;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(store?.name ?? '');
    setAddress(store?.address ?? '');
    setTimezone(store?.timezone ?? 'Africa/Nairobi');
    setError(null);
  }, [editing]);

  async function handleSubmit() {
    const isEdit = editing !== 'new' && editing != null;
    setBusy(true);
    setError(null);
    const res = await fetch(isEdit ? `${API_BASE_URL}/api/stores/${(editing as StoreRow).id}` : `${API_BASE_URL}/api/stores`, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({ tenant: tenantId, name, address: address || null, timezone }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.errors?.[0]?.message ?? `Failed to ${isEdit ? 'update' : 'create'} store`);
      setBusy(false);
      return;
    }
    setBusy(false);
    setEditing(null);
    refresh();
  }

  async function handleDelete() {
    if (editing === 'new' || editing == null) return;
    const res = await fetch(`${API_BASE_URL}/api/stores/${editing.id}`, {
      method: 'DELETE',
      headers: { Authorization: `JWT ${payloadToken}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      Alert.alert('Failed to delete store', body?.errors?.[0]?.message ?? 'This branch likely has order/shift history.');
      return;
    }
    setEditing(null);
    refresh();
  }

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border p-3">
        <Text className="text-lg font-semibold text-foreground">Stores</Text>
        <Pressable android_ripple={{ color: '#ffffff40' }} className="rounded-md bg-primary px-3 py-1.5 active:opacity-80" onPress={() => setEditing('new')}>
          <Text className="text-sm font-medium text-primary-foreground">New store</Text>
        </Pressable>
      </View>
      <FlatList
        contentContainerClassName="gap-2 p-3"
        data={stores}
        keyExtractor={(s) => String(s.id)}
        renderItem={({ item }) => (
          <Animated.View entering={FadeInDown.duration(200)}>
          <Pressable android_ripple={{}} className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setEditing(item)}>
            <Text className="font-medium text-foreground">{item.name}</Text>
            <Text className="text-xs text-muted-foreground">{item.address ?? 'No address'} · {item.timezone}</Text>
          </Pressable>
          </Animated.View>
        )}
      />

      <Modal visible={editing != null} animationType="slide" onRequestClose={() => setEditing(null)}>
        <View className="flex-1 bg-background pt-14">
          <View className="flex-row items-center justify-between border-b border-border px-4 pb-3">
            <Text className="text-lg font-semibold text-foreground">{editing === 'new' ? 'New store' : 'Edit store'}</Text>
            <Pressable android_ripple={{}} onPress={() => setEditing(null)}>
              <Text className="text-muted-foreground">Close</Text>
            </Pressable>
          </View>
          <View className="gap-3 p-4">
            <TextInput className="rounded-lg border border-border bg-card px-3 py-2 text-foreground" placeholder="Name" placeholderTextColor={placeholderColor} value={name} onChangeText={setName} />
            <TextInput className="rounded-lg border border-border bg-card px-3 py-2 text-foreground" placeholder="Address" placeholderTextColor={placeholderColor} value={address} onChangeText={setAddress} />
            <TextInput className="rounded-lg border border-border bg-card px-3 py-2 text-foreground" placeholder="Timezone" placeholderTextColor={placeholderColor} value={timezone} onChangeText={setTimezone} />
            {error ? <Text className="text-destructive">{error}</Text> : null}
            <Pressable android_ripple={{ color: '#ffffff40' }} className={`items-center rounded-lg bg-primary py-3 ${busy ? 'opacity-50' : 'active:opacity-80'}`} disabled={busy} onPress={handleSubmit}>
              <Text className="font-medium text-primary-foreground">{busy ? 'Saving...' : editing === 'new' ? 'Create store' : 'Save changes'}</Text>
            </Pressable>
            {editing !== 'new' ? (
              <Pressable android_ripple={{}} className="items-center rounded-lg border border-destructive py-3 active:opacity-70" onPress={handleDelete}>
                <Text className="font-medium text-destructive">Delete store</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}
