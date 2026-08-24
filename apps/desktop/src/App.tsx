import { useEffect, useRef, useState, type FormEvent } from "react";
import { getDb } from "./database";
import { loginToPayload, loginWithPin, type PayloadUser } from "./auth";
import { connectPowerSync, disconnectPowerSync, ensureAppDataDir } from "./powersync";
import { Till } from "./Till";
import { WrenchIcon } from "./icons";
import "./App.css";

type ConnectionState = "idle" | "logging-in" | "connecting" | "connected" | "error";
type LoginMode = "pin" | "password";

// Persisted per-installation so the same till keeps the same identity
// across restarts (used as StockMovements/Orders.sourceTerminal/terminal
// for audit/debug, per spec Section 4).
function getTerminalId(): string {
  const key = "hardware-pos-terminal-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `till-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

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

      setState("connecting");
      await connectPowerSync(payloadToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState("error");
    }
  }

  async function handleDisconnect() {
    await disconnectPowerSync();
    setUser(null);
    setState("idle");
  }

  if (state === "connected" && user && payloadTokenRef.current) {
    return (
      <Till
        user={user}
        terminalId={terminalId}
        payloadToken={payloadTokenRef.current}
        onDisconnect={handleDisconnect}
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
        <p className="terminal-tag">Terminal {terminalId}</p>
      </div>
    </main>
  );
}

export default App;
