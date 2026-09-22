import '../../global.css';
import { StatusBar } from 'expo-status-bar';
import { useMutedPlaceholderColor, useNavigationTheme } from '../lib/theme';
import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform, Linking, Image } from 'react-native';
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { API_BASE_URL, loginToPayload, loginWithPin, refreshTillToken, type PayloadUser } from '../lib/auth';
import { getTerminalId, getTerminalName, setTerminalName } from '../lib/terminal';
import { MIN_PIN_LENGTH, MAX_PIN_LENGTH } from '../lib/pin';
import { RootTabs } from '../navigation/RootTabs';
import { checkForUpdate, type AvailableUpdate } from '../lib/updateCheck';
import { PinPad } from '../components/PinPad';
import { AppNoticeHost } from '../components/AppNotice';
import { LoadingScreen } from '../components/LoadingScreen';
import { ErrorBoundary } from '../components/ErrorBoundary';

type ConnectionState = 'idle' | 'logging-in' | 'connected' | 'error';
type LoginMode = 'pin' | 'password';

interface StoreOption {
  id: number;
  name: string;
}

// This app is online-only now (no local database, no offline-resume login) -
// every login goes through a live /api/users/login or /api/auth/pin-login
// call, same as apps/web. There's no "connecting" step distinct from
// "logging-in" any more either, since there's no local sync engine to spin
// up afterward - a successful login response IS being connected.
function AppInner() {
  const placeholderColor = useMutedPlaceholderColor();
  const navigationTheme = useNavigationTheme();
  const [initializing, setInitializing] = useState(true);
  const [mode, setMode] = useState<LoginMode>('pin');
  const [pinStep, setPinStep] = useState<'phone' | 'pin'>('phone');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<PayloadUser | null>(null);
  const [terminalName, setTerminalNameState] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [activeStoreId, setActiveStoreId] = useState<number | null>(null);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  // State, not a ref - both are read during render below (RootTabs' props,
  // the "connected" guard, the login footer), and a ref's `.current` can't
  // safely be read during render (it wouldn't reliably trigger a re-render
  // when it changes).
  const [payloadToken, setPayloadToken] = useState<string | null>(null);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);

  // "Notify + redownload", not a silent auto-updater - same as
  // apps/desktop's identical checkForUpdate(). Fires once on launch;
  // production builds only in spirit (there's no public manifest for local
  // dev builds to compare against, so this is naturally a no-op there).
  useEffect(() => {
    checkForUpdate().then(setAvailableUpdate);
  }, []);

  useEffect(() => {
    (async () => {
      setTerminalId(await getTerminalId());
      setTerminalNameState(await getTerminalName());
      setInitializing(false);
    })();
  }, []);

  // Slides this till's session forward while it's connected, well ahead of
  // the server's TILL_TOKEN_TTL_SECONDS (apps/api/src/lib/tillAuth.ts) -
  // failures (offline, banned, canceled subscription) are silently ignored
  // here since a genuinely offline till simply can't refresh; the next
  // attempt retries, and any request needing a valid token will surface its
  // own clear "you're offline"/auth error at the point of use. Matches
  // apps/desktop/src/App.tsx's identical effect. Re-arms on every
  // payloadToken change so the closure below always holds the latest token,
  // not one already invalidated by an earlier refresh.
  useEffect(() => {
    if (state !== 'connected' || !user || !payloadToken) return;
    const TILL_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
    const interval = setInterval(async () => {
      try {
        const { payloadToken: freshToken, user: freshUser } = await refreshTillToken(payloadToken);
        setPayloadToken(freshToken);
        setUser(freshUser);
      } catch (err) {
        console.warn('Till session refresh failed (will retry later):', err);
      }
    }, TILL_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [state, user, payloadToken]);

  // Once connected, an owner/manager with no fixed store (Users.store is
  // nullable for exactly this) needs to pick which branch to work from -
  // fetched via the same REST endpoint StoresScreen.tsx already uses.
  // Auto-selects the only option when there's just one, matching the plan's
  // "auto-select-if-one-store" decision.
  useEffect(() => {
    if (state !== 'connected' || !user || !payloadToken) return;
    const fixedStoreId = typeof user.store === 'object' ? (user.store?.id ?? null) : (user.store ?? null);
    if (fixedStoreId != null) return;
    const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
    fetch(`${API_BASE_URL}/api/stores?where[tenant][equals]=${tenantId}&sort=name&limit=100`, {
      headers: { Authorization: `JWT ${payloadToken}` },
    })
      .then((res) => res.json())
      .then((body) => {
        const rows = (body?.docs ?? []) as StoreOption[];
        setStoreOptions(rows);
        if (rows.length === 1 && activeStoreId == null) {
          setActiveStoreId(rows[0].id);
        }
      })
      .catch(() => setStoreOptions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, user, payloadToken]);

  async function handleLogin(pinOverride?: string) {
    setError(null);
    try {
      setState('logging-in');
      const { payloadToken: newToken, user: loggedInUser } =
        mode === 'pin' ? await loginWithPin(phone, pinOverride ?? pin) : await loginToPayload(email, password);
      setPayloadToken(newToken);
      setUser(loggedInUser);
      const fixedStoreId = typeof loggedInUser.store === 'object' ? (loggedInUser.store?.id ?? null) : (loggedInUser.store ?? null);
      setActiveStoreId(fixedStoreId ?? null);
      setState('connected');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }

  function handleSignOut() {
    setUser(null);
    setActiveStoreId(null);
    setStoreOptions([]);
    setState('idle');
    setPin('');
    setPassword('');
  }

  function handleSwitchStore(storeId: number) {
    setActiveStoreId(storeId);
  }

  function handleSaveTerminalName() {
    if (!nameDraft.trim()) return;
    setTerminalName(nameDraft);
    setTerminalNameState(nameDraft.trim());
  }

  if (initializing) {
    return <LoadingScreen />;
  }

  // One-time, before even the login screen - guarantees every till gets a
  // real audit-friendly name from day one.
  if (!terminalName) {
    return (
      <LoginShell title="Name this till" subtitle='Shown on receipts and in audit history - e.g. "Front Counter"'>
        <TextInput
          className="rounded-lg border border-border bg-card px-4 py-3 text-foreground"
          autoFocus
          value={nameDraft}
          onChangeText={setNameDraft}
          placeholder="e.g. Front Counter"
          placeholderTextColor={placeholderColor}
        />
        <PrimaryButton label="Continue" onPress={handleSaveTerminalName} disabled={!nameDraft.trim()} />
      </LoginShell>
    );
  }

  if (state === 'connected' && user && payloadToken) {
    const fixedStoreId = typeof user.store === 'object' ? (user.store?.id ?? null) : (user.store ?? null);
    const needsStorePick = fixedStoreId == null && activeStoreId == null;
    if (needsStorePick) {
      return (
        <LoginShell title="Choose a branch" subtitle="This account isn't tied to a single store">
          {storeOptions.length === 0 ? (
            <Text className="text-center text-muted-foreground">No stores found yet.</Text>
          ) : (
            storeOptions.map((store) => (
              <Pressable android_ripple={{}}
                key={store.id}
                className="rounded-lg border border-border bg-card px-4 py-3 active:opacity-70"
                onPress={() => handleSwitchStore(store.id)}
              >
                <Text className="text-foreground">{store.name}</Text>
              </Pressable>
            ))
          )}
        </LoginShell>
      );
    }
    return (
      <View className="flex-1">
        {availableUpdate ? (
          <Pressable android_ripple={{ color: '#ffffff40' }}
            className="items-center bg-primary px-4 py-2"
            onPress={() => Linking.openURL(availableUpdate.downloadUrl)}
          >
            <Text className="text-sm font-medium text-primary-foreground">
              Update available (v{availableUpdate.latestVersion}) - tap to download
            </Text>
          </Pressable>
        ) : null}
        <NavigationContainer theme={navigationTheme}>
          <RootTabs
            user={user}
            payloadToken={payloadToken}
            terminalId={terminalId ?? ''}
            terminalName={terminalName}
            storeId={activeStoreId}
            onSignOut={handleSignOut}
          />
        </NavigationContainer>
      </View>
    );
  }

  const busy = state === 'logging-in';
  const submitLabel = busy ? 'Logging in...' : 'Log in';
  const phoneValid = phone.trim().length >= 9;

  // Split into a phone step then a dedicated, single-focus PIN step - matching
  // the resume screen above and every modern phone+PIN sign-in (M-Pesa, banking
  // apps) - rather than cramming a phone field and the full keypad into one
  // screen at once.
  if (mode === 'pin' && pinStep === 'pin') {
    return (
      <LoginShell title="Enter your PIN" subtitle={`Signing in as ${phone.trim()}`}>
        <PinPad value={pin} onChange={setPin} onComplete={(v) => handleLogin(v)} disabled={busy} error={error} />
        {pin.length >= MIN_PIN_LENGTH && pin.length < MAX_PIN_LENGTH ? <PrimaryButton label={submitLabel} onPress={() => handleLogin()} disabled={busy} /> : null}
        {error && <Text className="text-center text-destructive">{error}</Text>}
        <Pressable android_ripple={{}}
          className="items-center py-2"
          onPress={() => {
            setPinStep('phone');
            setPin('');
            setError(null);
          }}
          disabled={busy}
        >
          <Text className="text-sm text-muted-foreground">Not you? Change number</Text>
        </Pressable>
      </LoginShell>
    );
  }

  return (
    <LoginShell title="Fundi Till" subtitle={mode === 'pin' ? 'Sign in with your phone and till PIN' : 'Sign in with email and password'}>
      {mode === 'pin' ? (
        <>
          <TextInput
            className="rounded-lg border border-border bg-card px-4 py-3 text-center text-lg text-foreground"
            value={phone}
            onChangeText={setPhone}
            placeholder="0712345678"
            placeholderTextColor={placeholderColor}
            keyboardType="phone-pad"
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => phoneValid && setPinStep('pin')}
          />
          <PrimaryButton
            label="Continue"
            onPress={() => {
              setError(null);
              setPinStep('pin');
            }}
            disabled={!phoneValid}
          />
        </>
      ) : (
        <>
          <TextInput
            className="rounded-lg border border-border bg-card px-4 py-3 text-foreground"
            value={email}
            onChangeText={setEmail}
            placeholder="you@business.com"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            className="rounded-lg border border-border bg-card px-4 py-3 text-foreground"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={placeholderColor}
            secureTextEntry
          />
          <PrimaryButton label={submitLabel} onPress={() => handleLogin()} disabled={busy} />
        </>
      )}

      {error && <Text className="text-center text-destructive">{error}</Text>}

      <Pressable android_ripple={{}}
        className="items-center py-1"
        onPress={() => {
          setMode(mode === 'pin' ? 'password' : 'pin');
          setPinStep('phone');
          setPin('');
          setError(null);
        }}
        disabled={busy}
      >
        <Text className="text-sm text-muted-foreground">{mode === 'pin' ? 'Sign in with email instead' : 'Sign in with phone + PIN instead'}</Text>
      </Pressable>
      <Text className="text-center text-xs text-muted-foreground">
        {terminalName} · {terminalId}
      </Text>
    </LoginShell>
  );
}

function LoginShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
        <Image source={require('../../assets/images/icon.png')} className="mb-6 h-16 w-16 self-center rounded-2xl" />
        <View className="gap-3 rounded-2xl border border-border bg-card p-6">
          <View className="mb-2 gap-1">
            <Text className="text-2xl font-semibold text-foreground">{title}</Text>
            {subtitle && <Text className="text-muted-foreground">{subtitle}</Text>}
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      className={`items-center overflow-hidden rounded-lg bg-primary px-4 py-3 ${disabled ? 'opacity-50' : 'active:opacity-80'}`}
      android_ripple={disabled ? undefined : { color: '#ffffff40' }}
      onPress={onPress}
      disabled={disabled}
    >
      <Text className="font-medium text-primary-foreground">{label}</Text>
    </Pressable>
  );
}

export const App = () => {
  return (
    // Wraps the entire tree - this component is the true root (index.js just
    // calls registerRootComponent(App), no other wrapper in between) - so an
    // otherwise-uncaught render error anywhere below (including inside
    // AppInner) shows ErrorScreen instead of leaving a blank/crashed screen.
    <ErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            {/* "auto" tracks the OS color scheme itself (light content on dark, dark content on light) - same source of truth as global.css's prefers-color-scheme tokens, so the status bar never mismatches the app's own theme. */}
            <StatusBar style="auto" />
            <AppInner />
            <AppNoticeHost />
          </KeyboardProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
};

export default App;
