import { useEffect, useRef, useState, type FormEvent } from "react";
import { getDb } from "./database";
import { loginToPayload } from "./auth";
import { connectPowerSync, disconnectPowerSync, ensureAppDataDir, refreshPayloadToken } from "./powersync";
import "./App.css";

type ConnectionState = "idle" | "logging-in" | "connecting" | "connected" | "error";

interface Counts {
  products: number;
  stores: number;
  users: number;
  stock_movements: number;
}

function App() {
  const [email, setEmail] = useState("owner@demo-hardware.test");
  const [password, setPassword] = useState("demo-password-123");
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const payloadTokenRef = useRef<string | null>(null);

  const appendLog = (line: string) => setLog((prev) => [...prev, `${new Date().toLocaleTimeString()}  ${line}`]);

  useEffect(() => {
    // Work around the plugin not creating its own storage directory (see
    // ensure_app_data_dir's doc comment in src-tauri/src/lib.rs) before
    // anything tries to open the database.
    ensureAppDataDir()
      .then((dir) => appendLog(`app data dir ready at ${dir}`))
      .catch((err) => appendLog(`ensureAppDataDir failed: ${err}`));

    const db = getDb();
    const dispose = db.registerListener({
      statusChanged: (status) => {
        appendLog(
          `sync status: connected=${status.connected} connecting=${status.connecting}` +
            (status.uploading ? " uploading" : "") +
            (status.downloading ? " downloading" : ""),
        );
        if (status.connected) setState("connected");
      },
    });
    return () => dispose();
  }, []);

  async function refreshCounts() {
    const db = getDb();
    const [products, stores, users, stock_movements] = await Promise.all([
      db.getAll<{ c: number }>("SELECT COUNT(*) as c FROM products"),
      db.getAll<{ c: number }>("SELECT COUNT(*) as c FROM stores"),
      db.getAll<{ c: number }>("SELECT COUNT(*) as c FROM users"),
      db.getAll<{ c: number }>("SELECT COUNT(*) as c FROM stock_movements"),
    ]);
    setCounts({
      products: products[0]?.c ?? 0,
      stores: stores[0]?.c ?? 0,
      users: users[0]?.c ?? 0,
      stock_movements: stock_movements[0]?.c ?? 0,
    });
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setState("logging-in");
      appendLog(`logging in as ${email} via POST /api/users/login`);
      const { payloadToken, user } = await loginToPayload(email, password);
      payloadTokenRef.current = payloadToken;
      appendLog(`login ok, user id=${user.id} role=${user.role}`);

      setState("connecting");
      appendLog("fetching PowerSync token + connecting Rust-side connector");
      await connectPowerSync(payloadToken);
      appendLog("powersync_connect resolved (connect() only enqueues; watch sync status above)");

      await refreshCounts();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setState("error");
      appendLog(`ERROR: ${message}`);
    }
  }

  async function handleDisconnect() {
    await disconnectPowerSync();
    setState("idle");
    appendLog("disconnected");
  }

  async function handleRefreshToken() {
    if (!payloadTokenRef.current) return;
    try {
      // Re-login to get a fresh Payload token (in a real app this would use
      // a refresh-token endpoint instead of re-collecting the password; kept
      // simple here since this screen's only job is proving the sync path).
      const { payloadToken } = await loginToPayload(email, password);
      payloadTokenRef.current = payloadToken;
      await refreshPayloadToken(payloadToken);
      appendLog("refreshed Payload token held by the Rust connector");
    } catch (err) {
      appendLog(`token refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleInsertTestMovement() {
    try {
      const db = getDb();
      const id = crypto.randomUUID();
      // Demo tenant/store/product ids from the seed data (Demo Hardware Co,
      // Westlands Branch, first seeded product) - see apps/api's seed script.
      await db.execute(
        `INSERT INTO stock_movements
           (id, tenant_id, store_id, product_id, quantity_delta, reason, client_timestamp, source_terminal)
         VALUES (?, 1, 1, 1, -1, 'sale', ?, 'desktop-sync-poc')`,
        [id, new Date().toISOString()],
      );
      appendLog(`inserted local stock_movements row id=${id} (should upload to Postgres via the connector)`);
      await refreshCounts();
    } catch (err) {
      appendLog(`insert failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <main className="container">
      <h1>Hardware POS Till - PowerSync Connection</h1>

      {state !== "connected" ? (
        <form onSubmit={handleLogin} className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <input value={email} onChange={(e) => setEmail(e.currentTarget.value)} placeholder="email" />
          <input
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            placeholder="password"
            type="password"
          />
          <button type="submit" disabled={state === "logging-in" || state === "connecting"}>
            {state === "logging-in" ? "Logging in..." : state === "connecting" ? "Connecting..." : "Log in & connect"}
          </button>
        </form>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          <button onClick={handleInsertTestMovement}>Insert test stock movement</button>
          <button onClick={handleRefreshToken}>Refresh token</button>
          <button onClick={handleDisconnect}>Disconnect</button>
        </div>
      )}

      <p data-testid="connection-state">
        Status: <strong>{state}</strong>
      </p>
      {error && <p style={{ color: "red" }}>{error}</p>}

      {counts && (
        <ul>
          <li>products: {counts.products}</li>
          <li>stores: {counts.stores}</li>
          <li>users: {counts.users}</li>
          <li>stock_movements: {counts.stock_movements}</li>
        </ul>
      )}

      <pre style={{ textAlign: "left", maxHeight: 240, overflowY: "auto", fontSize: 12 }}>{log.join("\n")}</pre>
    </main>
  );
}

export default App;
