import { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { disconnectPowerSync } from '../db/database';
import { clearSession } from '../lib/session';
import type { PayloadUser } from '../lib/auth';
import { SellScreen as RealSellScreen } from '../sell/SellScreen';
import { CustomersScreen as RealCustomersScreen } from '../customers/CustomersScreen';
import { InventoryScreen as RealInventoryScreen } from '../inventory/InventoryScreen';
import { SalesScreen as RealSalesScreen } from '../sales/SalesScreen';
import { StaffScreen } from '../admin/StaffScreen';
import { StoresScreen } from '../admin/StoresScreen';
import { SettingsScreen } from '../admin/SettingsScreen';
import { AuditLogScreen } from '../admin/AuditLogScreen';

type AdminSection = 'staff' | 'stores' | 'settings' | 'audit';

// Back-office admin (Phase 5) is intentionally tucked under More, not its
// own tabs - this is deliberately last per the plan: none of it happens on
// the shop floor at sale-time the way Sell/Inventory/Customers/Sales do,
// and back-office work is more naturally done on a bigger screen (the web
// dashboard) - this is here for the rare on-the-floor case, not as the
// primary surface for it.
function MoreScreen({
  user,
  payloadToken,
  terminalName,
  onSignOut,
}: {
  user: PayloadUser;
  payloadToken: string;
  terminalName: string;
  onSignOut: () => void;
}) {
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
  const canManage = user.role === 'owner' || user.role === 'manager';
  const [section, setSection] = useState<AdminSection | null>(null);

  return (
    <View className="flex-1 bg-background px-6 pt-8">
      <Text className="text-2xl font-semibold text-foreground">{user.name ?? user.email}</Text>
      <Text className="mt-1 text-muted-foreground">{user.role} · {terminalName}</Text>

      {canManage ? (
        <View className="mt-6 gap-2">
          <Pressable className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('staff')}>
            <Text className="text-foreground">Staff</Text>
          </Pressable>
          <Pressable className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('stores')}>
            <Text className="text-foreground">Stores</Text>
          </Pressable>
          {user.role === 'owner' ? (
            <Pressable className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('settings')}>
              <Text className="text-foreground">Settings</Text>
            </Pressable>
          ) : null}
          <Pressable className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('audit')}>
            <Text className="text-foreground">Audit log</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        className="mt-8 items-center rounded-lg bg-destructive px-4 py-3 active:opacity-80"
        onPress={onSignOut}
      >
        <Text className="font-medium text-primary-foreground">Sign out</Text>
      </Pressable>

      <Modal visible={section != null} animationType="slide" onRequestClose={() => setSection(null)}>
        <View className="flex-1 bg-background pt-14">
          <View className="flex-row items-center justify-between border-b border-border px-4 pb-3">
            <Text className="text-lg font-semibold capitalize text-foreground">{section === 'audit' ? 'Audit log' : section}</Text>
            <Pressable onPress={() => setSection(null)}>
              <Text className="text-muted-foreground">Close</Text>
            </Pressable>
          </View>
          {section === 'staff' ? <StaffScreen payloadToken={payloadToken} tenantId={tenantId} /> : null}
          {section === 'stores' ? <StoresScreen payloadToken={payloadToken} tenantId={tenantId} /> : null}
          {section === 'settings' ? <SettingsScreen payloadToken={payloadToken} tenantId={tenantId} /> : null}
          {section === 'audit' ? <AuditLogScreen payloadToken={payloadToken} /> : null}
        </View>
      </Modal>
    </View>
  );
}

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Sell: 'cart-outline',
  Inventory: 'cube-outline',
  Customers: 'people-outline',
  Sales: 'receipt-outline',
  More: 'ellipsis-horizontal-circle-outline',
};

export function RootTabs({
  user,
  payloadToken,
  terminalId,
  terminalName,
  storeId,
  onSignOut,
}: {
  user: PayloadUser;
  payloadToken: string;
  terminalId: string;
  terminalName: string;
  storeId: number | null;
  onSignOut: () => void;
}) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#df5102',
        tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="Sell">
        {() => <RealSellScreen user={user} payloadToken={payloadToken} terminalId={terminalId} terminalName={terminalName} storeId={storeId} />}
      </Tab.Screen>
      <Tab.Screen name="Inventory">{() => <RealInventoryScreen user={user} terminalId={terminalId} storeId={storeId} />}</Tab.Screen>
      <Tab.Screen name="Customers">{() => <RealCustomersScreen user={user} payloadToken={payloadToken} storeId={storeId} />}</Tab.Screen>
      <Tab.Screen name="Sales">{() => <RealSalesScreen user={user} payloadToken={payloadToken} storeId={storeId} />}</Tab.Screen>
      <Tab.Screen name="More">{() => <MoreScreen user={user} payloadToken={payloadToken} terminalName={terminalName} onSignOut={onSignOut} />}</Tab.Screen>
    </Tab.Navigator>
  );
}

/** Signs this till out entirely - disconnects PowerSync and clears the persisted offline-resume session. */
export async function signOut(): Promise<void> {
  await disconnectPowerSync();
  await clearSession();
}
