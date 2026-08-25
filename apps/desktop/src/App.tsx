import { useEffect, useRef, useState, type FormEvent } from "react";
import { getDb } from "./database";
import { loginToPayload, loginWithPin, type PayloadUser } from "./auth";
import { connectPowerSync, disconnectPowerSync, ensureAppDataDir } from "./powersync";
import { getTerminalId, getTerminalName, setTerminalName } from "./terminal";
import { Till } from "./Till";
import { WrenchIcon } from "./icons";
import "./App.css";

type ConnectionState = "idle" | "logging-in" | "connecting" | "connected" | "error";
type LoginMode = "pin" | "password";

function App() {
  // PIN is the default - the fast path for day-to-day till login. Password
  // stays available since a brand-new staff member may not have a PIN/phone
  // set yet (see the dashboard's Staff page).
  const [mode, setMode] = useState<LoginMode>("pin");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("owner@demo-hardware.test");
  const [password, setPassword] = useState("demo-password-123");
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<PayloadUser | null>(null);
  const [terminalName, setTerminalNameState] = useState(() => getTerminalName());
  const [nameDraft, setNameDraft] = useState("");
  // null while no branch has been picked yet for a multi-store user (see
  // Till.tsx's own comment on canSelectStore) - a fixed-store user's actual
  // store id lives on `user` itself and never touches this.
  const [activeStoreId, setActiveStoreId] = useState<number | null>(null);
  const [switchingStore, setSwitchingStore] = useState(false);
  const payloadTokenRef = useRef<string | null>(null);
  const terminalId = useRef(getTerminalId()).current;

  useEffect(() => {
    ensureAppDataDir().catch((err) => console.error("ensureAppDataDir failed", err));

    const db = getDb();
    const dispose = db.registerListener({
      statusChanged: (status) => {
        if (status.connected) setState("connected");
      },
    });
    return () => dispose();
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setState("logging-in");
      const { payloadToken, user: loggedInUser } =
        mode === "pin" ? await loginWithPin(phone, pin) : await loginToPayload(email, password);
      payloadTokenRef.current = payloadToken;
      setUser(loggedInUser);

      const fixedStoreId = typeof loggedInUser.store === "object" ? loggedInUser.store?.id : loggedInUser.store;
      setState("connecting");
      await connectPowerSync(payloadToken, fixedStoreId ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState("error");
    }
  }

  async function handleDisconnect() {
    await disconnectPowerSync();
    setUser(null);
    setActiveStoreId(null);
    setState("idle");
  }

  // Full disconnect + reconnect, exactly like login - PowerSync has no
  // "hot" way to reparameterize an already-connected session's store scope
  // (see connectPowerSync's own comment), so switching branches means
  // asking for a fresh token scoped to the new store and starting over.
  async function handleSwitchStore(storeId: number) {
    if (!payloadTokenRef.current) return;
    setSwitchingStore(true);
    try {
      await disconnectPowerSync();
      await connectPowerSync(payloadTokenRef.current, storeId);
      setActiveStoreId(storeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSwitchingStore(false);
    }
  }

  function handleSaveTerminalName(e: FormEvent) {
    e.preventDefault();
    if (!nameDraft.trim()) return;
    setTerminalName(nameDraft);
    setTerminalNameState(nameDraft.trim());
  }

  // One-time, before even the login screen - guarantees every till gets a
  // real audit-friendly name from day one rather than relying on someone
  // remembering to set it later via Till.tsx's settings drawer.
  if (!terminalName) {
    return (
      <main className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand-mark">
              <WrenchIcon />
            </span>
            <div className="login-brand-text">
              <h1>Name this till</h1>
              <p>Shown on receipts and in audit history - e.g. "Front Counter"</p>
            </div>
          </div>
          <form onSubmit={handleSaveTerminalName} className="login-form">
            <div className="field">
              <span className="field-label">Till name</span>
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.currentTarget.value)}
                placeholder="e.g. Front Counter"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!nameDraft.trim()}>
              Continue
            </button>
          </form>
          <p className="terminal-tag">You can rename this later from the till's settings.</p>
        </div>
      </main>
    );
  }

  if (state === "connected" && user && payloadTokenRef.current) {
    const fixedStoreId = typeof user.store === "object" ? user.store?.id : user.store;
    return (
      <Till
        user={user}
        terminalId={terminalId}
        terminalName={terminalName}
        onRenameTerminal={(name) => {
          setTerminalName(name);
          setTerminalNameState(name.trim());
        }}
        payloadToken={payloadTokenRef.current}
        onDisconnect={handleDisconnect}
        activeStoreId={fixedStoreId ?? activeStoreId}
        canSelectStore={fixedStoreId == null}
        onSwitchStore={handleSwitchStore}
        switchingStore={switchingStore}
      />
    );
  }

  const busy = state === "logging-in" || state === "connecting";
  const submitLabel = state === "logging-in" ? "Logging in..." : state === "connecting" ? "Connecting..." : "Log in";

  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">
            <WrenchIcon />
          </span>
          <div className="login-brand-text">
            <h1>Fundi Till</h1>
            <p>Sign in to start selling</p>
          </div>
        </div>

        <div className="segmented" role="tablist" aria-label="Login method">
          <button
            type="button"
            role="tab"
            aria-pressed={mode === "pin"}
            onClick={() => setMode("pin")}
          >
            PIN login
          </button>
          <button
            type="button"
            role="tab"
            aria-pressed={mode === "password"}
            onClick={() => setMode("password")}
          >
            Password login
          </button>
        </div>

        {mode === "pin" ? (
          <form onSubmit={handleLogin} className="login-form">
            <div className="field">
              <span className="field-label">Phone number</span>
              <input value={phone} onChange={(e) => setPhone(e.currentTarget.value)} placeholder="0712345678" />
            </div>
            <div className="field">
              <span className="field-label">PIN</span>
              <input
                value={pin}
                onChange={(e) => setPin(e.currentTarget.value)}
                placeholder="••••"
                type="password"
                inputMode="numeric"
                maxLength={6}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {submitLabel}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="login-form">
            <div className="field">
              <span className="field-label">Email</span>
              <input value={email} onChange={(e) => setEmail(e.currentTarget.value)} placeholder="you@business.com" />
            </div>
            <div className="field">
              <span className="field-label">Password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder="••••••••"
                type="password"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {submitLabel}
            </button>
          </form>
        )}

        {error && <p className="error-banner">{error}</p>}

        <p className="status-line" data-testid="connection-state">
          Status: <strong>{state}</strong>
        </p>
        <p className="terminal-tag">{terminalName} · {terminalId}</p>
      </div>
    </main>
  );
}

export default App;
