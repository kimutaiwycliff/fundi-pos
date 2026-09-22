import { useEffect, useRef, useState, type FormEvent } from "react";
import { loginToPayload, loginWithPin, refreshTillToken, type PayloadUser } from "./auth";
import { getTerminalId, getTerminalName, setTerminalName } from "./terminal";
import { checkForUpdate, type AvailableUpdate } from "./updateCheck";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppShell } from "./AppShell";
import { WrenchIcon } from "./icons";
import "./App.css";

// This app is online-only now (no local database, no offline-resume login) -
// every login goes through a live /api/auth/pin-login or /api/users/login
// call, the same as apps/web and the now-converted apps/mobile. There is no
// separate "connecting" step any more either: a successful login response
// IS being connected, since there's no local sync engine left to spin up
// afterwards.
type ConnectionState = "idle" | "logging-in" | "connected" | "error";
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
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);

  // There's no auto-updater (see updateCheck.ts) - a till that installed
  // once and never came back to the download page otherwise has no way to
  // know it's missing every fix shipped since. import.meta.env.PROD keeps
  // this quiet during `npm run dev`, where "current" is whatever's mid-work
  // and comparing it against the last real release is meaningless noise.
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    checkForUpdate().then(setAvailableUpdate);
  }, []);

  // Slides this till's session forward well ahead of the server's own
  // TILL_TOKEN_TTL_SECONDS (apps/api/src/lib/tillAuth.ts) - a till left
  // running continuously for a long time (weeks/months without a restart)
  // would otherwise eventually need a fresh phone+PIN login mid-shift once
  // its token actually expired. Failures (offline, banned, canceled
  // subscription) are silently ignored here - the next attempt retries, and
  // this timer isn't the place to interrupt an already-working till mid-shift
  // over a transient network blip.
  useEffect(() => {
    if (state !== "connected" || !user) return;
    const TILL_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
    const interval = setInterval(async () => {
      if (!payloadTokenRef.current) return;
      try {
        const { payloadToken: freshToken, user: freshUser } = await refreshTillToken(payloadTokenRef.current);
        payloadTokenRef.current = freshToken;
        setUser(freshUser);
      } catch (err) {
        console.warn("Till session refresh failed (will retry later):", err);
      }
    }, TILL_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [state, user]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setState("logging-in");
      const { payloadToken, user: loggedInUser } =
        mode === "pin" ? await loginWithPin(phone, pin) : await loginToPayload(email, password);
      payloadTokenRef.current = payloadToken;
      setUser(loggedInUser);
      setState("connected");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState("error");
    }
  }

  function handleDisconnect() {
    setUser(null);
    setActiveStoreId(null);
    setState("idle");
    // Phone (and email) stay filled - the next login is almost always the
    // same person/till, so retyping it every time is pure friction. PIN and
    // password don't: leaving a credential sitting in a field after logout
    // is the actual problem, regardless of which login mode was last used.
    setPin("");
    setPassword("");
  }

  // Purely a client-side scope change now - there's no local sync session to
  // tear down and re-establish for the new store any more (Till.tsx's own
  // REST fetches for catalog/stock/tenant/stores all react to activeStoreId
  // changing on their own). Kept async (and switchingStore kept as a brief,
  // now near-instant, busy flag) so BranchSwitcher.tsx needs no changes.
  async function handleSwitchStore(storeId: number) {
    setSwitchingStore(true);
    try {
      setActiveStoreId(storeId);
    } finally {
      setSwitchingStore(false);
    }
  }

  function renderUpdateBanner() {
    if (!availableUpdate) return null;
    return (
      <button
        type="button"
        className="update-banner"
        onClick={() => openUrl(availableUpdate.downloadUrl).catch((err) => console.error("openUrl failed", err))}
      >
        A newer version (v{availableUpdate.latestVersion}) is available - you're on v{availableUpdate.currentVersion}. Tap to download.
      </button>
    );
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
      <AppShell
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

  const busy = state === "logging-in";
  const submitLabel = state === "logging-in" ? "Logging in..." : "Log in";

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
        {renderUpdateBanner()}
      </div>
    </main>
  );
}

export default App;
