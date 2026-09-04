import '../../global.css';
import { StatusBar } from 'expo-status-bar';
import { useMutedPlaceholderColor, useNavigationTheme } from '../lib/theme';
import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform, Linking, Image } from 'react-native';
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { loginToPayload, loginWithPin, type PayloadUser } from '../lib/auth';
import { connectPowerSync, disconnectPowerSync } from '../db/database';
import { getTerminalId, getTerminalName, setTerminalName } from '../lib/terminal';
import { checkPinLocallyById, MIN_PIN_LENGTH, MAX_PIN_LENGTH } from '../lib/pin';
import { loadSession, saveSession, clearSession, updateSessionStore, type PersistedSession } from '../lib/session';
import { getDb } from '../db/database';
import { RootTabs } from '../navigation/RootTabs';
import { checkForUpdate, type AvailableUpdate } from '../lib/updateCheck';
import { PinPad } from '../components/PinPad';
import { AppNoticeHost } from '../components/AppNotice';
import { isBiometricAvailable, isBiometricEnabledFor, authenticateWithBiometrics } from '../lib/biometric';

type ConnectionState = 'idle' | 'logging-in' | 'connecting' | 'connected' | 'error';
type LoginMode = 'pin' | 'password';

interface StoreOption {
  id: number;
  name: string;
}

// Ported from apps/desktop/src/App.tsx - same state machine (terminal-name
// gate -> connected app -> offline-resume PIN screen -> login screen), same
// guard order, same reasoning for every branch - just RN components/
// NativeWind instead of DOM+CSS, and everything that touched localStorage
// synchronously there (session.ts/terminal.ts) is awaited here since
// expo-secure-store is async.
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
  const payloadTokenRef = useRef<string | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const [resumeCandidate, setResumeCandidate] = useState<PersistedSession | null>(null);
  const [resumePin, setResumePin] = useState('');
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [biometricReady, setBiometricReady] = useState(false);

  // "Notify + redownload", not a silent auto-updater - same as
  // apps/desktop's identical checkForUpdate(). Fires once on launch;
  // production builds only in spirit (there's no public manifest for local
  // dev builds to compare against, so this is naturally a no-op there).
  useEffect(() => {
    checkForUpdate().then(setAvailableUpdate);
  }, []);

  useEffect(() => {
    (async () => {
      terminalIdRef.current = await getTerminalId();
      setTerminalNameState(await getTerminalName());
      setResumeCandidate(await loadSession());
      setInitializing(false);
    })();
  }, []);

  // Fingerprint is purely an additive shortcut on top of the same
  // resumeCandidate PIN flow below (see biometric.ts's own note on why) -
  // only offered once both the device can actually do it AND this specific
  // person opted in via the More tab.
  useEffect(() => {
    if (!resumeCandidate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBiometricReady(false);
      return;
    }
    let active = true;
    Promise.all([isBiometricAvailable(), isBiometricEnabledFor(resumeCandidate.user.id)]).then(([available, enabled]) => {
      if (active) setBiometricReady(available && enabled);
    });
    return () => {
      active = false;
    };
  }, [resumeCandidate]);

  // Once connected, an owner/manager with no fixed store (Users.store is
  // nullable for exactly this) needs to pick which branch to sync - the
  // tenant-scoped `stores` table is already populated at this point even
  // with storeId=null (only store-scoped streams like stock_movements wait
  // on a real storeId). Auto-selects the only option when there's just one,
  // matching the plan's "auto-select-if-one-store" decision.
  useEffect(() => {
    if (state !== 'connected' || !user) return;
    const fixedStoreId = typeof user.store === 'object' ? (user.store?.id ?? null) : (user.store ?? null);
    if (fixedStoreId != null) return;
    getDb()
      // PowerSync's local `stores.id` is TEXT (every PowerSync primary key
      // is, regardless of the real Postgres column type - same rule
      // connector.ts's toNumber() already works around for order line
      // items) - coerced back to a real number right here so every
      // downstream consumer (activeStoreId, ShiftWidget, openShift's POST
      // body) sends Payload a JSON number, not a string. Left uncoerced,
      // Payload's relationship-field validation on Shifts.store rejects it
      // outright ("The following field is invalid: Store").
      .getAll<StoreOption>('SELECT id, name FROM stores ORDER BY name')
      .then((rows) => {
        const coerced = rows.map((row) => ({ ...row, id: Number(row.id) }));
        setStoreOptions(coerced);
        if (coerced.length === 1 && activeStoreId == null) {
          void handleSwitchStore(coerced[0].id);
        }
      })
      .catch(() => setStoreOptions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, user]);

  async function handleLogin(pinOverride?: string) {
    setError(null);
    try {
      setState('logging-in');
      const { payloadToken, user: loggedInUser } =
        mode === 'pin' ? await loginWithPin(phone, pinOverride ?? pin) : await loginToPayload(email, password);
      payloadTokenRef.current = payloadToken;
      setUser(loggedInUser);

      const fixedStoreId = typeof loggedInUser.store === 'object' ? (loggedInUser.store?.id ?? null) : (loggedInUser.store ?? null);
      setState('connecting');
      await connectPowerSync(payloadToken, fixedStoreId ?? null);
      setActiveStoreId(fixedStoreId ?? null);
      await saveSession(payloadToken, loggedInUser, fixedStoreId ?? null);
      setState('connected');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }

  // Shared by both resume paths below once the person's identity is
  // confirmed (PIN or fingerprint) - reconnects PowerSync under the
  // already-resident payloadToken, same as a fresh login's own tail end.
  async function finishResume(candidate: PersistedSession) {
    payloadTokenRef.current = candidate.payloadToken;
    setUser(candidate.user);
    setActiveStoreId(candidate.storeId);
    setState('connecting');
    await connectPowerSync(candidate.payloadToken, candidate.storeId);
    setState('connected');
  }

  // Re-entry for a till that already logged in online at least once
  // (session.ts, up to 24h old) - gated by the same local, zero-network PIN
  // mechanism (pin.ts's checkPinLocallyById). Deliberately checks only
  // resumeCandidate's own user id: this is "resume MY session", not a
  // general login.
  async function handleResume(pinOverride?: string) {
    if (!resumeCandidate) return;
    setResumeError(null);
    const candidate = resumeCandidate;
    try {
      setState('logging-in');
      // Start the PowerSync connect immediately, in parallel with the
      // local PIN check, instead of waiting for it to finish first -
      // candidate.payloadToken is already a valid, previously-issued
      // credential sitting in SecureStore regardless of the PIN outcome
      // (the PIN here is a local convenience gate on an already-
      // authenticated device, not what produces the token), so there's no
      // security reason to serialize two independent slow steps. checkPin-
      // LocallyById's scrypt verification is a genuinely heavy pure-JS
      // computation (see pin.ts's own note) - this was the dominant real
      // cost of resuming a session, confirmed by testing sync speed alone
      // wasn't enough. Torn back down below if the PIN turns out wrong.
      const connectPromise = connectPowerSync(candidate.payloadToken, candidate.storeId);
      setState('connecting');
      const result = await checkPinLocallyById(candidate.user.id, pinOverride ?? resumePin);
      if (!result || !result.valid) {
        await connectPromise.catch(() => undefined);
        await disconnectPowerSync().catch(() => undefined);
        setResumeError('Incorrect PIN');
        setState('idle');
        return;
      }
      await connectPromise;
      payloadTokenRef.current = candidate.payloadToken;
      setUser(candidate.user);
      setActiveStoreId(candidate.storeId);
      setState('connected');
    } catch (err) {
      await disconnectPowerSync().catch(() => undefined);
      setResumeError(err instanceof Error ? err.message : String(err));
      setState('idle');
    }
  }

  // Fingerprint shortcut for the same resume flow - authenticateAsync only
  // confirms the device owner is present, it never returns a credential, so
  // success here skips straight past checkPinLocallyById to finishResume
  // (the payloadToken it unlocks was already sitting in SecureStore either
  // way). Any failure/cancel just leaves the PIN pad there - never a
  // dead end.
  async function handleResumeWithBiometrics() {
    if (!resumeCandidate) return;
    setResumeError(null);
    const ok = await authenticateWithBiometrics(`Sign in as ${resumeCandidate.user.name || resumeCandidate.user.email}`);
    if (!ok) return;
    try {
      setState('logging-in');
      await finishResume(resumeCandidate);
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : String(err));
      setState('idle');
    }
  }

  function handleUseDifferentAccount() {
    setResumeCandidate(null);
    setResumeError(null);
    setResumePin('');
  }

  async function handleSignOut() {
    await disconnectPowerSync();
    await clearSession();
    setResumeCandidate(null);
    setUser(null);
    setActiveStoreId(null);
    setState('idle');
    setPin('');
    setPassword('');
  }

  // Full disconnect + reconnect, exactly like login - PowerSync has no "hot"
  // way to reparameterize an already-connected session's store scope (see
  // connectPowerSync's own comment).
  async function handleSwitchStore(storeId: number) {
    if (!payloadTokenRef.current) return;
    try {
      await disconnectPowerSync();
      await connectPowerSync(payloadTokenRef.current, storeId);
      setActiveStoreId(storeId);
      await updateSessionStore(storeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleSaveTerminalName() {
    if (!nameDraft.trim()) return;
    setTerminalName(nameDraft);
    setTerminalNameState(nameDraft.trim());
  }

  if (initializing) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#df5102" />
      </View>
    );
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

  if (state === 'connected' && user && payloadTokenRef.current) {
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
            payloadToken={payloadTokenRef.current}
            terminalId={terminalIdRef.current ?? ''}
            terminalName={terminalName}
            storeId={activeStoreId}
            onSignOut={handleSignOut}
          />
        </NavigationContainer>
      </View>
    );
  }

  if (resumeCandidate) {
    const resumeBusy = state === 'logging-in' || state === 'connecting';
    return (
      <LoginShell title="Welcome back" subtitle={resumeCandidate.user.name || resumeCandidate.user.email}>
        {biometricReady ? (
          <Pressable
            android_ripple={{ color: '#ffffff30', radius: 40, borderless: true }}
            className={`mb-1 items-center gap-1.5 self-center ${resumeBusy ? 'opacity-50' : ''}`}
            disabled={resumeBusy}
            onPress={handleResumeWithBiometrics}
          >
            <View className="h-16 w-16 items-center justify-center rounded-full border border-primary bg-card">
              <Ionicons name="finger-print-outline" size={30} color="#df5102" />
            </View>
            <Text className="text-sm text-muted-foreground">Use fingerprint</Text>
          </Pressable>
        ) : null}
        <PinPad
          value={resumePin}
          onChange={(v) => {
            setResumeError(null);
            setResumePin(v);
          }}
          onComplete={(v) => handleResume(v)}
          disabled={resumeBusy}
          error={resumeError}
        />
        {resumePin.length >= MIN_PIN_LENGTH && resumePin.length < MAX_PIN_LENGTH ? (
          <PrimaryButton label={resumeBusy ? 'Continuing...' : 'Continue'} onPress={() => handleResume()} disabled={resumeBusy} />
        ) : null}
        {resumeError && <Text className="text-center text-destructive">{resumeError}</Text>}
        <Pressable android_ripple={{}} className="items-center py-2" onPress={handleUseDifferentAccount} disabled={resumeBusy}>
          <Text className="text-muted-foreground">Use a different account</Text>
        </Pressable>
        <Text className="text-center text-xs text-muted-foreground">Works offline - this till already signed in as this person within the last 24h.</Text>
      </LoginShell>
    );
  }

  const busy = state === 'logging-in' || state === 'connecting';
  const submitLabel = state === 'logging-in' ? 'Logging in...' : state === 'connecting' ? 'Connecting...' : 'Log in';
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
        {terminalName} · {terminalIdRef.current}
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
  );
};

export default App;
