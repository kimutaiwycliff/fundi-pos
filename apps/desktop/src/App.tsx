import { useEffect, useRef, useState, type FormEvent } from "react";
import { getDb } from "./database";
import { loginToPayload, type PayloadUser } from "./auth";
import { connectPowerSync, disconnectPowerSync, ensureAppDataDir } from "./powersync";
import { Till } from "./Till";
import "./App.css";

type ConnectionState = "idle" | "logging-in" | "connecting" | "connected" | "error";

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
  const [email, setEmail] = useState("owner@demo-hardware.test");
  const [password, setPassword] = useState("demo-password-123");
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<PayloadUser | null>(null);
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
      const { payloadToken, user: loggedInUser } = await loginToPayload(email, password);
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

  if (state === "connected" && user) {
    return <Till user={user} terminalId={terminalId} onDisconnect={handleDisconnect} />;
  }

  return (
    <main className="container">
      <h1>Hardware POS Till</h1>
      <form onSubmit={handleLogin} className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <input value={email} onChange={(e) => setEmail(e.currentTarget.value)} placeholder="email" />
        <input
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          placeholder="password"
          type="password"
        />
        <button type="submit" disabled={state === "logging-in" || state === "connecting"}>
          {state === "logging-in" ? "Logging in..." : state === "connecting" ? "Connecting..." : "Log in"}
        </button>
      </form>

      <p data-testid="connection-state">
        Status: <strong>{state}</strong>
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}

export default App;
