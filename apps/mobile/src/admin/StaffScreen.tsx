import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Modal, Alert, ScrollView } from 'react-native';
import { API_BASE_URL } from '../lib/auth';

interface Staff {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  role: 'owner' | 'manager' | 'cashier';
  status: 'active' | 'banned';
  store: { id: number } | number | null;
}

interface StoreRef {
  id: number;
  name: string;
}

const ROLES: Staff['role'][] = ['owner', 'manager', 'cashier'];

// Owner/manager only, mirrors apps/web/.../staff/*.tsx - online-only REST
// against Payload's users collection directly (not a proxy, unlike web's
// /api/payload/* routes - mobile has no server-side proxy of its own, same
// as every other mobile REST call this build). Password/PIN are only sent
// on edit if the owner actually typed something new, so leaving them blank
// never clobbers an existing credential.
export function StaffScreen({ payloadToken, tenantId }: { payloadToken: string; tenantId: number }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [stores, setStores] = useState<StoreRef[]>([]);
  const [editing, setEditing] = useState<Staff | 'new' | null>(null);

  function refresh() {
    fetch(`${API_BASE_URL}/api/users?where[tenant][equals]=${tenantId}&sort=name&limit=200`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    })
      .then((r) => r.json())
      .then((body) => setStaff(body?.docs ?? []));
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

  async function toggleBan(member: Staff) {
    const nextStatus = member.status === 'banned' ? 'active' : 'banned';
    const res = await fetch(`${API_BASE_URL}/api/users/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      Alert.alert('Failed', body?.errors?.[0]?.message ?? 'Failed to update status');
      return;
    }
    refresh();
  }

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border p-3">
        <Text className="text-lg font-semibold text-foreground">Staff</Text>
        <Pressable className="rounded-md bg-primary px-3 py-1.5 active:opacity-80" onPress={() => setEditing('new')}>
          <Text className="text-sm font-medium text-primary-foreground">Add staff</Text>
        </Pressable>
      </View>
      <FlatList
        contentContainerClassName="gap-2 p-3"
        data={staff}
        keyExtractor={(s) => String(s.id)}
        renderItem={({ item }) => (
          <Pressable className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setEditing(item)}>
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="font-medium text-foreground">{item.name || item.email}</Text>
                <Text className="text-xs text-muted-foreground">
                  {item.role} · {item.email}
                </Text>
              </View>
              {item.status === 'banned' ? <Text className="text-xs font-medium text-destructive">banned</Text> : null}
            </View>
          </Pressable>
        )}
      />
      <StaffFormModal
        visible={editing != null}
        staff={editing === 'new' ? null : editing}
        stores={stores}
        payloadToken={payloadToken}
        tenantId={tenantId}
        onClose={() => setEditing(null)}
        onToggleBan={editing !== 'new' && editing ? () => toggleBan(editing) : undefined}
        onSaved={refresh}
      />
    </View>
  );
}

function StaffFormModal({
  visible,
  staff,
  stores,
  payloadToken,
  tenantId,
  onClose,
  onToggleBan,
  onSaved,
}: {
  visible: boolean;
  staff: Staff | null;
  stores: StoreRef[];
  payloadToken: string;
  tenantId: number;
  onClose: () => void;
  onToggleBan?: () => void;
  onSaved: () => void;
}) {
  const isEdit = staff != null;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<Staff['role']>('cashier');
  const [storeId, setStoreId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(staff?.name ?? '');
    setEmail(staff?.email ?? '');
    setPassword('');
    setPhone(staff?.phone ?? '');
    setPin('');
    setRole(staff?.role ?? 'cashier');
    setStoreId(staff?.store == null ? null : typeof staff.store === 'object' ? staff.store.id : staff.store);
    setError(null);
  }, [visible, staff]);

  async function handleSubmit() {
    if (!isEdit && !password) {
      setError('Password is required');
      return;
    }
    setBusy(true);
    setError(null);
    const data: Record<string, unknown> = { name, email, phone: phone || null, role, store: storeId, tenant: tenantId };
    if (password) data.password = password;
    if (pin) data.pin = pin;
    const res = await fetch(isEdit ? `${API_BASE_URL}/api/users/${staff?.id}` : `${API_BASE_URL}/api/users`, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `JWT ${payloadToken}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.errors?.[0]?.message ?? `Failed to ${isEdit ? 'update' : 'create'} staff member`);
      setBusy(false);
      return;
    }
    setBusy(false);
    onSaved();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-background pt-14">
        <View className="flex-row items-center justify-between border-b border-border px-4 pb-3">
          <Text className="text-lg font-semibold text-foreground">{isEdit ? 'Edit staff' : 'Add staff'}</Text>
          <Pressable onPress={onClose}>
            <Text className="text-muted-foreground">Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerClassName="gap-3 p-4">
          <TextInput className="rounded-lg border border-border bg-card px-3 py-2 text-foreground" placeholder="Name" placeholderTextColor="#6e605a" value={name} onChangeText={setName} />
          <TextInput
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
            placeholder="Email"
            placeholderTextColor="#6e605a"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
            placeholder={isEdit ? 'New password (leave blank to keep current)' : 'Password'}
            placeholderTextColor="#6e605a"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <TextInput
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
            placeholder="Phone e.g. 0712345678"
            placeholderTextColor="#6e605a"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TextInput
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
            placeholder={isEdit ? 'Reset till PIN (leave blank to keep current)' : 'Till PIN (4-6 digits)'}
            placeholderTextColor="#6e605a"
            keyboardType="number-pad"
            maxLength={6}
            value={pin}
            onChangeText={setPin}
          />

          <Text className="text-sm text-muted-foreground">Role</Text>
          <View className="flex-row gap-1.5">
            {ROLES.map((r) => (
              <Pressable key={r} className={`flex-1 items-center rounded-md border py-2 ${role === r ? 'border-primary bg-primary' : 'border-border'}`} onPress={() => setRole(r)}>
                <Text className={role === r ? 'font-medium text-primary-foreground' : 'text-foreground'}>{r}</Text>
              </Pressable>
            ))}
          </View>

          <Text className="text-sm text-muted-foreground">Store</Text>
          <View className="flex-row flex-wrap gap-1.5">
            <Pressable className={`rounded-md border px-3 py-1.5 ${storeId == null ? 'border-primary bg-primary' : 'border-border'}`} onPress={() => setStoreId(null)}>
              <Text className={storeId == null ? 'text-sm font-medium text-primary-foreground' : 'text-sm text-foreground'}>All stores</Text>
            </Pressable>
            {stores.map((s) => (
              <Pressable key={s.id} className={`rounded-md border px-3 py-1.5 ${storeId === s.id ? 'border-primary bg-primary' : 'border-border'}`} onPress={() => setStoreId(s.id)}>
                <Text className={storeId === s.id ? 'text-sm font-medium text-primary-foreground' : 'text-sm text-foreground'}>{s.name}</Text>
              </Pressable>
            ))}
          </View>

          {error ? <Text className="text-destructive">{error}</Text> : null}

          <Pressable className={`items-center rounded-lg bg-primary py-3 ${busy ? 'opacity-50' : 'active:opacity-80'}`} disabled={busy} onPress={handleSubmit}>
            <Text className="font-medium text-primary-foreground">{busy ? 'Saving...' : isEdit ? 'Save changes' : 'Add staff'}</Text>
          </Pressable>

          {onToggleBan ? (
            <Pressable
              className="items-center rounded-lg border border-destructive py-3 active:opacity-70"
              onPress={() => onToggleBan()}
            >
              <Text className="font-medium text-destructive">{staff?.status === 'banned' ? 'Reactivate' : 'Ban'}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
