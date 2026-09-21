import { useEffect, useRef, useState, type FormEvent } from "react";
import { getDb } from "./database";
import { loginToPayload, loginWithPin, refreshTillToken, type PayloadUser } from "./auth";
import { connectPowerSync, disconnectPowerSync, ensureAppDataDir, refreshPayloadToken } from "./powersync";
import { getTerminalId, getTerminalName, setTerminalName } from "./terminal";
import { checkPinLocallyById } from "./pin";
import { loadSession, saveSession, clearSession, updateSessionStore, type PersistedSession } from "./session";
import { checkForUpdate, type AvailableUpdate } from "./updateCheck";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppShell } from "./AppShell";
import { LoadingScreen } from "./LoadingScreen";
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
  // A till that logged in online at least once can resume straight into
  // the Till UI later via its cached PIN, even fully offline (session.ts
  // handles the 30-day expiry, slid forward automatically while online by
  // the refresh effect below) - null once either no session was ever
  // saved, it's past 30 days, or the user chose "use a different account"
  // below.
  const [resumeCandidate, setResumeCandidate] = useState<PersistedSession | null>(() => loadSession());
  const [resumePin, setResumePin] = useState("");
  const [resumeError, setResumeError] = useState<string | null>(null);
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

  // Slides this till's session forward while it's actually connected, well
  // ahead of its 30-day server-side/local-resume cap (tillAuth.ts's
  // TILL_TOKEN_TTL_SECONDS, session.ts's matching OFFLINE_SESSION_TTL_MS) -
  // a till that's regularly online this way never actually needs a fresh
  // phone+PIN login; only one that goes fully offline for the entire
  // window does. Failures (offline, banned, canceled subscription) are
  // silently ignored here - the next attempt retries, and a genuinely
  // banned/canceled account is caught sooner anyway by PowerSync's own
  // ~1hr credential re-check (/api/powersync/token) - this timer isn't the
  // place to interrupt an already-working till mid-shift over a transient
  // network blip.
  useEffect(() => {
    if (state !== "connected" || !user) return;
    const TILL_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
    const interval = setInterval(async () => {
      if (!payloadTokenRef.current) return;
      try {
        const { payloadToken: freshToken, user: freshUser } = await refreshTillToken(payloadTokenRef.current);
        payloadTokenRef.current = freshToken;
        setUser(freshUser);
        await refreshPayloadToken(freshToken);
        saveSession(freshToken, freshUser, activeStoreId);
      } catch (err) {
        console.warn("Till session refresh failed (will retry later):", err);
      }
    }, TILL_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [state, user, activeStoreId]);

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
      saveSession(payloadToken, loggedInUser, fixedStoreId ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState("error");
    }
  }

  // Re-entry for a till that already logged in online at least once
  // (session.ts, up to 24h old) - gated by the same local, zero-network PIN
  // mechanism fast cashier switching uses (pin.ts's checkPinLocallyById),
  // not a bare "was logged in before". Deliberately checks only
  // resumeCandidate's own user id: this is "resume MY session", not a
  // general login - a different staff member starting fresh still needs
  // connectivity via "Use a different account".
  async function handleResume(e: FormEvent) {
    e.preventDefault();
    if (!resumeCandidate) return;
    setResumeError(null);
    try {
      setState("logging-in");
      const result = await checkPinLocallyById(resumeCandidate.user.id, resumePin);
      if (!result || !result.valid) {
        setResumeError("Incorrect PIN");
        setState("idle");
        return;
      }
      payloadTokenRef.current = resumeCandidate.payloadToken;
      setUser(resumeCandidate.user);
      setActiveStoreId(resumeCandidate.storeId);
      setState("connecting");
      // skipPreflight: this is exactly the offline case - the Rust
      // connector re-fetches real credentials with its own retry/backoff
      // once connectivity is actually available (see powersync.ts).
      await connectPowerSync(resumeCandidate.payloadToken, resumeCandidate.storeId, { skipPreflight: true });
      setState("connected");
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : String(err));
      setState("idle");
    }
  }

  function handleUseDifferentAccount() {
    setResumeCandidate(null);
    setResumeError(null);
    setResumePin("");
  }

  async function handleDisconnect() {
    await disconnectPowerSync();
    clearSession();
    setResumeCandidate(null);
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
      updateSessionStore(storeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // error above is only ever rendered on the full login form, which
      // isn't showing once <Till> has mounted (the only place this is
      // actually called from) - re-throw so the caller can surface it too
      // (a toast). Without this, a failed switch silently did nothing
      // visible at all - caught live: an auto-select-on-mount that keeps
      // failing would otherwise retry forever with zero indication why.
      throw err;
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

  // Full-screen takeover only for "connecting", not "logging-in":
  // establishing the initial PowerSync connection (right after a fresh
  // login or a cached-PIN resume, both above) is the one moment here
  // that's worth blocking the whole screen for - it's rare, there's no
  // form usefully left underneath it, and it can genuinely take a few
  // seconds on a slow network. The credential-check step ("logging-in")
  // deliberately stays as the existing inline button-label/error-banner
  // treatment below: it's usually near-instant, and it's the step most
  // likely to end in a normal validation error (wrong PIN/password) that
  // the user should see resolved right back on the same form, not behind
  // a full-screen flash-and-return.
  if (state === "connecting") {
    return (
      <LoadingScreen
        message={
          resumeCandidate
            ? `Welcome back, ${resumeCandidate.user.name || resumeCandidate.user.email}...`
            : undefined
        }
      />
    );
  }

  if (resumeCandidate) {
    // "connecting" is handled by the full-screen takeover above and never
    // reaches this render, so the only busy state left to reflect here is
    // the local PIN check itself.
    const resumeBusy = state === "logging-in";
    return (
      <main className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand-mark">
              <WrenchIcon />
            </span>
            <div className="login-brand-text">
              <h1>Welcome back</h1>
              <p>{resumeCandidate.user.name || resumeCandidate.user.email}</p>
            </div>
          </div>
          <form onSubmit={handleResume} className="login-form">
            <div className="field">
              <span className="field-label">PIN</span>
              <input
                autoFocus
                value={resumePin}
                onChange={(e) => setResumePin(e.currentTarget.value)}
                placeholder="••••"
                type="password"
                inputMode="numeric"
                maxLength={6}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={resumeBusy || !resumePin}>
              {resumeBusy ? "Continuing..." : "Continue"}
            </button>
          </form>
          {resumeError && <p className="error-banner">{resumeError}</p>}
          <button type="button" className="btn btn-block" onClick={handleUseDifferentAccount} disabled={resumeBusy}>
            Use a different account
          </button>
          <p className="terminal-tag">
            Works offline - this till already signed in as this person within the last 30 days.
          </p>
          {renderUpdateBanner()}
        </div>
      </main>
    );
  }

  // Same as above: "connecting" is caught by the full-screen takeover
  // before this point, so the only busy state left to label here is the
  // credential check itself.
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
