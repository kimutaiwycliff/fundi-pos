import { View, Text, Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { disconnectPowerSync } from '../db/database';
import { clearSession } from '../lib/session';
import type { PayloadUser } from '../lib/auth';
import { SellScreen as RealSellScreen } from '../sell/SellScreen';
import { CustomersScreen as RealCustomersScreen } from '../customers/CustomersScreen';
import { InventoryScreen as RealInventoryScreen } from '../inventory/InventoryScreen';
import { SalesScreen as RealSalesScreen } from '../sales/SalesScreen';

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
      <Tab.Screen name="More">{() => <MoreScreen user={user} terminalName={terminalName} onSignOut={onSignOut} />}</Tab.Screen>
    </Tab.Navigator>
  );
}

/** Signs this till out entirely - disconnects PowerSync and clears the persisted offline-resume session. */
export async function signOut(): Promise<void> {
  await disconnectPowerSync();
  await clearSession();
}
