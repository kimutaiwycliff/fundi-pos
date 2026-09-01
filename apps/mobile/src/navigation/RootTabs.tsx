import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { getDb } from '../db/database';
import { disconnectPowerSync } from '../db/database';
import { clearSession } from '../lib/session';
import type { PayloadUser } from '../lib/auth';

// Placeholder screens for Phase 0 - just enough to prove the navigation
// shell + NativeWind theming + local synced-data reads all work end to
// end. Phase 1/2/3 replace each of these with the real Sell/Inventory/
// Customers screens described in the plan.
function SellScreen() {
  const [productCount, setProductCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDb()
      .getOptional<{ count: number }>('SELECT COUNT(*) as count FROM products WHERE is_active = 1')
      .then((row) => {
        if (!cancelled) setProductCount(row?.count ?? 0);
      })
      .catch(() => {
        if (!cancelled) setProductCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="text-2xl font-semibold text-foreground">Sell</Text>
      <Text className="mt-2 text-center text-muted-foreground">
        {productCount === null ? 'Loading synced catalog...' : `${productCount} active products synced locally`}
      </Text>
    </View>
  );
}

function InventoryScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="text-2xl font-semibold text-foreground">Inventory</Text>
      <Text className="mt-2 text-center text-muted-foreground">Stock levels, adjustments and transfers land here in Phase 3.</Text>
    </View>
  );
}

function CustomersScreen() {
  const [customerCount, setCustomerCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDb()
      .getOptional<{ count: number }>('SELECT COUNT(*) as count FROM customers')
      .then((row) => {
        if (!cancelled) setCustomerCount(row?.count ?? 0);
      })
      .catch(() => {
        if (!cancelled) setCustomerCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="text-2xl font-semibold text-foreground">Customers</Text>
      <Text className="mt-2 text-center text-muted-foreground">
        {customerCount === null ? 'Loading synced customers...' : `${customerCount} customers synced locally`}
      </Text>
    </View>
  );
}

function MoreScreen({ user, terminalName, onSignOut }: { user: PayloadUser; terminalName: string; onSignOut: () => void }) {
  return (
    <View className="flex-1 bg-background px-6 pt-8">
      <Text className="text-2xl font-semibold text-foreground">{user.name ?? user.email}</Text>
      <Text className="mt-1 text-muted-foreground">{user.role} · {terminalName}</Text>
      <Pressable
        className="mt-8 items-center rounded-lg bg-destructive px-4 py-3 active:opacity-80"
        onPress={onSignOut}
      >
        <Text className="font-medium text-primary-foreground">Sign out</Text>
      </Pressable>
    </View>
  );
}

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Sell: 'cart-outline',
  Inventory: 'cube-outline',
  Customers: 'people-outline',
  More: 'ellipsis-horizontal-circle-outline',
};

export function RootTabs({ user, terminalName, onSignOut }: { user: PayloadUser; terminalName: string; onSignOut: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#df5102',
        tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="Sell" component={SellScreen} />
      <Tab.Screen name="Inventory" component={InventoryScreen} />
      <Tab.Screen name="Customers" component={CustomersScreen} />
      <Tab.Screen name="More">{() => <MoreScreen user={user} terminalName={terminalName} onSignOut={onSignOut} />}</Tab.Screen>
    </Tab.Navigator>
  );
}

/** Signs this till out entirely - disconnects PowerSync and clears the persisted offline-resume session. */
export async function signOut(): Promise<void> {
  await disconnectPowerSync();
  await clearSession();
}
