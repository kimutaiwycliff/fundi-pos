import '../../global.css';
import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { loginToPayload, loginWithPin, type PayloadUser } from '../lib/auth';
import { connectPowerSync, disconnectPowerSync } from '../db/database';
import { getTerminalId, getTerminalName, setTerminalName } from '../lib/terminal';
import { checkPinLocallyById } from '../lib/pin';
import { loadSession, saveSession, clearSession, updateSessionStore, type PersistedSession } from '../lib/session';
import { getDb } from '../db/database';
import { RootTabs } from '../navigation/RootTabs';
import { checkForUpdate, type AvailableUpdate } from '../lib/updateCheck';

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
  const [initializing, setInitializing] = useState(true);
  const [mode, setMode] = useState<LoginMode>('pin');
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
      .getAll<StoreOption>('SELECT id, name FROM stores ORDER BY name')
      .then((rows) => {
        setStoreOptions(rows);
        if (rows.length === 1 && activeStoreId == null) {
          void handleSwitchStore(rows[0].id);
        }
      })
      .catch(() => setStoreOptions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, user]);

  async function handleLogin() {
    setError(null);
    try {
      setState('logging-in');
      const { payloadToken, user: loggedInUser } = mode === 'pin' ? await loginWithPin(phone, pin) : await loginToPayload(email, password);
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

  // Re-entry for a till that already logged in online at least once
  // (session.ts, up to 24h old) - gated by the same local, zero-network PIN
  // mechanism (pin.ts's checkPinLocallyById). Deliberately checks only
  // resumeCandidate's own user id: this is "resume MY session", not a
  // general login.
  async function handleResume() {
    if (!resumeCandidate) return;
    setResumeError(null);
    try {
      setState('logging-in');
      const result = await checkPinLocallyById(resumeCandidate.user.id, resumePin);
      if (!result || !result.valid) {
        setResumeError('Incorrect PIN');
        setState('idle');
        return;
      }
      payloadTokenRef.current = resumeCandidate.payloadToken;
      setUser(resumeCandidate.user);
      setActiveStoreId(resumeCandidate.storeId);
      setState('connecting');
      await connectPowerSync(resumeCandidate.payloadToken, resumeCandidate.storeId);
      setState('connected');
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
          placeholderTextColor="#6e605a"
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
              <Pressable
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
          <Pressable
            className="items-center bg-primary px-4 py-2"
            onPress={() => Linking.openURL(availableUpdate.downloadUrl)}
          >
            <Text className="text-sm font-medium text-primary-foreground">
              Update available (v{availableUpdate.latestVersion}) - tap to download
            </Text>
          </Pressable>
        ) : null}
        <NavigationContainer>
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
        <TextInput
          className="rounded-lg border border-border bg-card px-4 py-3 text-center text-2xl tracking-widest text-foreground"
          autoFocus
          value={resumePin}
          onChangeText={setResumePin}
          placeholder="••••"
          placeholderTextColor="#6e605a"
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
        />
        <PrimaryButton label={resumeBusy ? 'Continuing...' : 'Continue'} onPress={handleResume} disabled={resumeBusy || !resumePin} />
        {resumeError && <Text className="text-center text-destructive">{resumeError}</Text>}
        <Pressable className="items-center py-2" onPress={handleUseDifferentAccount} disabled={resumeBusy}>
          <Text className="text-muted-foreground">Use a different account</Text>
        </Pressable>
        <Text className="text-center text-xs text-muted-foreground">Works offline - this till already signed in as this person within the last 24h.</Text>
      </LoginShell>
    );
  }

  const busy = state === 'logging-in' || state === 'connecting';
  const submitLabel = state === 'logging-in' ? 'Logging in...' : state === 'connecting' ? 'Connecting...' : 'Log in';

  return (
    <LoginShell title="Fundi Till" subtitle="Sign in to start selling">
      <View className="flex-row rounded-lg bg-muted p-1">
        <Pressable className={`flex-1 items-center rounded-md py-2 ${mode === 'pin' ? 'bg-card' : ''}`} onPress={() => setMode('pin')}>
          <Text className={mode === 'pin' ? 'font-medium text-foreground' : 'text-muted-foreground'}>PIN login</Text>
        </Pressable>
        <Pressable className={`flex-1 items-center rounded-md py-2 ${mode === 'password' ? 'bg-card' : ''}`} onPress={() => setMode('password')}>
          <Text className={mode === 'password' ? 'font-medium text-foreground' : 'text-muted-foreground'}>Password login</Text>
        </Pressable>
      </View>

      {mode === 'pin' ? (
        <>
          <TextInput
            className="rounded-lg border border-border bg-card px-4 py-3 text-foreground"
            value={phone}
            onChangeText={setPhone}
            placeholder="0712345678"
            placeholderTextColor="#6e605a"
            keyboardType="phone-pad"
          />
          <TextInput
            className="rounded-lg border border-border bg-card px-4 py-3 text-foreground"
            value={pin}
            onChangeText={setPin}
            placeholder="••••"
            placeholderTextColor="#6e605a"
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
          />
        </>
      ) : (
        <>
          <TextInput
            className="rounded-lg border border-border bg-card px-4 py-3 text-foreground"
            value={email}
            onChangeText={setEmail}
            placeholder="you@business.com"
            placeholderTextColor="#6e605a"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            className="rounded-lg border border-border bg-card px-4 py-3 text-foreground"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#6e605a"
            secureTextEntry
          />
        </>
      )}

      <PrimaryButton label={submitLabel} onPress={handleLogin} disabled={busy} />
      {error && <Text className="text-center text-destructive">{error}</Text>}
      <Text className="text-center text-xs text-muted-foreground">
        {terminalName} · {terminalIdRef.current}
      </Text>
    </LoginShell>
  );
}

function LoginShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-center px-6">
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
      className={`items-center rounded-lg bg-primary px-4 py-3 ${disabled ? 'opacity-50' : 'active:opacity-80'}`}
      onPress={onPress}
      disabled={disabled}
    >
      <Text className="font-medium text-primary-foreground">{label}</Text>
    </Pressable>
  );
}

export const App = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppInner />
    </GestureHandlerRootView>
  );
};

export default App;
