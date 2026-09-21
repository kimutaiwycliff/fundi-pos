import { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, Switch, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { disconnectPowerSync } from '../db/database';
import { clearSession } from '../lib/session';
import { isBiometricEnabledFor, setBiometricEnabledFor, authenticateWithBiometrics, getBiometricDiagnostics, type BiometricDiagnostics } from '../lib/biometric';
import type { PayloadUser } from '../lib/auth';
import { SellScreen as RealSellScreen } from '../sell/SellScreen';
import { CustomersScreen as RealCustomersScreen } from '../customers/CustomersScreen';
import { InventoryScreen as RealInventoryScreen } from '../inventory/InventoryScreen';
import { ProductsScreen } from '../inventory/ProductsScreen';
import { SalesScreen as RealSalesScreen } from '../sales/SalesScreen';
import { StaffScreen } from '../admin/StaffScreen';
import { StoresScreen } from '../admin/StoresScreen';
import { SettingsScreen } from '../admin/SettingsScreen';
import { AuditLogScreen } from '../admin/AuditLogScreen';
import { ReportsScreen } from '../admin/ReportsScreen';
import { OverviewScreen } from '../overview/OverviewScreen';
import { RestockHomeScreen } from '../restock/RestockHomeScreen';
import { QuotationsHomeScreen } from '../quotes/QuotationsHomeScreen';

type AdminSection = 'staff' | 'stores' | 'settings' | 'audit' | 'customers' | 'security' | 'reports' | 'inventory' | 'restock' | 'quotations';

// Back-office admin (Phase 5) is intentionally tucked under More, not its
// own tabs - this is deliberately last per the plan: none of it happens on
// the shop floor at sale-time the way Sell/Inventory/Customers/Sales do,
// and back-office work is more naturally done on a bigger screen (the web
// dashboard) - this is here for the rare on-the-floor case, not as the
// primary surface for it.
function MoreScreen({
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
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
  const canManage = user.role === 'owner' || user.role === 'manager';
  const [section, setSection] = useState<AdminSection | null>(null);
  const [biometricDiagnostics, setBiometricDiagnostics] = useState<BiometricDiagnostics | null>(null);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const biometricAvailable = biometricDiagnostics?.hasHardware && biometricDiagnostics?.isEnrolled;

  useEffect(() => {
    let active = true;
    Promise.all([getBiometricDiagnostics(), isBiometricEnabledFor(user.id)]).then(([diagnostics, enabled]) => {
      if (!active) return;
      setBiometricDiagnostics(diagnostics);
      setBiometricEnabledState(enabled);
    });
    return () => {
      active = false;
    };
  }, [user.id]);

  async function handleToggleBiometric(next: boolean) {
    if (next) {
      // Confirm the sensor actually works for this person before trusting
      // it as a login shortcut - same reasoning as apps/web's own "verify
      // before saving" pattern for anything security-adjacent.
      const ok = await authenticateWithBiometrics('Confirm to enable fingerprint login');
      if (!ok) return;
    }
    await setBiometricEnabledFor(user.id, next);
    setBiometricEnabledState(next);
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background px-6 pt-4">
      <Text className="text-2xl font-semibold text-foreground">{user.name ?? user.email}</Text>
      <Text className="mt-1 text-muted-foreground">{user.role} · {terminalName}</Text>

      <View className="mt-6 gap-2">
        <Pressable android_ripple={{}} className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('customers')}>
          <Text className="text-foreground">Customers</Text>
        </Pressable>
        <Pressable android_ripple={{}} className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('reports')}>
          <Text className="text-foreground">Reports</Text>
        </Pressable>
        <Pressable android_ripple={{}} className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('inventory')}>
          <Text className="text-foreground">Inventory</Text>
        </Pressable>
        <Pressable android_ripple={{}} className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('restock')}>
          <Text className="text-foreground">Restock</Text>
        </Pressable>
        <Pressable android_ripple={{}} className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('security')}>
          <Text className="text-foreground">Security</Text>
        </Pressable>
      </View>

      {canManage ? (
        <View className="mt-6 gap-2">
          <Pressable android_ripple={{}} className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('staff')}>
            <Text className="text-foreground">Staff</Text>
          </Pressable>
          <Pressable android_ripple={{}} className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('stores')}>
            <Text className="text-foreground">Stores</Text>
          </Pressable>
          <Pressable android_ripple={{}} className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('quotations')}>
            <Text className="text-foreground">Quotations</Text>
          </Pressable>
          {user.role === 'owner' ? (
            <Pressable android_ripple={{}} className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('settings')}>
              <Text className="text-foreground">Settings</Text>
            </Pressable>
          ) : null}
          <Pressable android_ripple={{}} className="rounded-lg border border-border bg-card p-3 active:opacity-70" onPress={() => setSection('audit')}>
            <Text className="text-foreground">Audit log</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable android_ripple={{ color: '#ffffff40' }}
        className="mt-8 items-center rounded-lg bg-destructive px-4 py-3 active:opacity-80"
        onPress={onSignOut}
      >
        <Text className="font-medium text-primary-foreground">Sign out</Text>
      </Pressable>

      <Modal visible={section != null} animationType="slide" onRequestClose={() => setSection(null)}>
        <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View className="flex-row items-center justify-between border-b border-border px-4 pb-3">
            <Text className="text-lg font-semibold capitalize text-foreground">{section === 'audit' ? 'Audit log' : section}</Text>
            <Pressable android_ripple={{}} onPress={() => setSection(null)}>
              <Text className="text-muted-foreground">Close</Text>
            </Pressable>
          </View>
          {section === 'staff' ? <StaffScreen payloadToken={payloadToken} tenantId={tenantId} /> : null}
          {section === 'stores' ? <StoresScreen payloadToken={payloadToken} tenantId={tenantId} /> : null}
          {section === 'settings' ? <SettingsScreen payloadToken={payloadToken} tenantId={tenantId} /> : null}
          {section === 'audit' ? <AuditLogScreen payloadToken={payloadToken} /> : null}
          {section === 'customers' ? <RealCustomersScreen user={user} payloadToken={payloadToken} storeId={storeId} /> : null}
          {section === 'reports' ? <ReportsScreen user={user} payloadToken={payloadToken} /> : null}
          {section === 'inventory' ? <RealInventoryScreen user={user} terminalId={terminalId} storeId={storeId} /> : null}
          {section === 'restock' ? <RestockHomeScreen user={user} storeId={storeId} payloadToken={payloadToken} /> : null}
          {section === 'quotations' ? <QuotationsHomeScreen user={user} payloadToken={payloadToken} storeId={storeId} /> : null}
          {section === 'security' ? (
            <View className="flex-1 px-6 pt-4">
              {biometricAvailable ? (
                <View className="flex-row items-center justify-between rounded-lg border border-border bg-card p-3">
                  <View className="shrink pr-3">
                    <Text className="text-foreground">Fingerprint login</Text>
                    <Text className="text-xs text-muted-foreground">Skip typing your PIN to resume this till</Text>
                  </View>
                  <Switch value={biometricEnabled} onValueChange={handleToggleBiometric} trackColor={{ true: '#df5102' }} />
                </View>
              ) : biometricDiagnostics && !biometricAvailable ? (
                // Not the normal "hide the row" case - the toggle is expected
                // but the device is reporting it as unavailable, so show why
                // instead of silently disappearing. Temporary until confirmed
                // working on a real sideloaded install (see biometric.ts's
                // own note on MIUI).
                <View className="rounded-lg border border-border bg-card p-3">
                  <Text className="text-foreground">Fingerprint login unavailable</Text>
                  <Text className="mt-1 text-xs text-muted-foreground">
                    hardware: {String(biometricDiagnostics.hasHardware)} · enrolled: {String(biometricDiagnostics.isEnrolled)}
                    {biometricDiagnostics.error ? ` · error: ${biometricDiagnostics.error}` : ''}
                  </Text>
                  {biometricDiagnostics.systemReportsSensor && !biometricDiagnostics.hasHardware ? (
                    // Android's own PackageManager confirms a sensor is
                    // physically present (a check independent of the one
                    // above - see biometric.ts's own note), so this isn't a
                    // missing-hardware case. Known MIUI behavior for apps
                    // installed outside the Play Store/GetApps: it can block
                    // the security API this app checks against without
                    // actually removing the fingerprint sensor. Only actual
                    // fix is a device-side permission, not app code.
                    <Text className="mt-2 text-xs text-muted-foreground">
                      Your phone reports a fingerprint sensor, but its security settings are blocking this app from using it - common on MIUI/Xiaomi for apps
                      installed outside the Play Store. Check Settings → Apps → Fundi Till → Permissions (or Settings → Privacy → Special app access) for a
                      fingerprint/biometric permission to enable.
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text className="text-muted-foreground">Checking device capabilities...</Text>
              )}
            </View>
          ) : null}
        </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Overview: 'stats-chart-outline',
  Sell: 'cart-outline',
  Sales: 'receipt-outline',
  Products: 'pricetag-outline',
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
  // Supplying a custom tabBarStyle.height opts the navigator out of its own
  // default safe-area-aware sizing, so the system nav bar's inset has to be
  // re-added explicitly here - on gesture-nav devices that inset is small
  // enough to go unnoticed, but on a classic 3-button nav bar (~48dp) it
  // was eating into the tab bar itself, partly covering it.
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#df5102',
        tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />,
        tabBarStyle: { paddingTop: 8, paddingBottom: 8 + insets.bottom, height: 64 + insets.bottom },
      })}
    >
      <Tab.Screen name="Overview">{() => <OverviewScreen user={user} storeId={storeId} />}</Tab.Screen>
      <Tab.Screen name="Sell">
        {() => <RealSellScreen user={user} payloadToken={payloadToken} terminalId={terminalId} terminalName={terminalName} storeId={storeId} />}
      </Tab.Screen>
      <Tab.Screen name="Sales">{() => <RealSalesScreen user={user} payloadToken={payloadToken} storeId={storeId} />}</Tab.Screen>
      <Tab.Screen name="Products">{() => <ProductsScreen user={user} payloadToken={payloadToken} storeId={storeId} />}</Tab.Screen>
      <Tab.Screen name="More">
        {() => <MoreScreen user={user} payloadToken={payloadToken} terminalId={terminalId} terminalName={terminalName} storeId={storeId} onSignOut={onSignOut} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

/** Signs this till out entirely - disconnects PowerSync and clears the persisted offline-resume session. */
export async function signOut(): Promise<void> {
  await disconnectPowerSync();
  await clearSession();
}
