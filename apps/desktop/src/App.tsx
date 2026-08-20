import { useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import { getSpikeDb } from "./spikeDatabase";
import "./App.css";

const ROWS_PER_RUN = 5;

// Guards against React.StrictMode's dev-mode double-invoke of effects so the
// spike only inserts one batch per real process launch, not two.
let spikeHasRun = false;

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const [spikeStatus, setSpikeStatus] = useState("not started");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  useEffect(() => {
    if (spikeHasRun) return;
    spikeHasRun = true;

    (async () => {
      try {
        await invoke("spike_log", { message: "starting PowerSync tauri-plugin spike" });

        // Work around the plugin not creating its own storage directory
        // (see spike_ensure_app_data_dir doc comment in src-tauri/src/lib.rs).
        const dataDir = await invoke<string>("spike_ensure_app_data_dir");
        await invoke("spike_log", { message: `app data dir ready at ${dataDir}` });

        const db = getSpikeDb();
        await db.init();
        await invoke("spike_log", { message: `db.init() resolved, rustHandle=${db.rustHandle}` });

        const before = await db.getAll<{ c: number }>(
          "SELECT COUNT(*) as c FROM spike_test",
        );
        const beforeCount = before[0]?.c ?? 0;
        await invoke("spike_log", { message: `BEFORE_INSERT count=${beforeCount}` });

        const makeId = () =>
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        const runId = makeId();

        for (let seq = 0; seq < ROWS_PER_RUN; seq++) {
          await db.execute(
            "INSERT INTO spike_test (id, run_id, seq, created_at) VALUES (?, ?, ?, ?)",
            [makeId(), runId, seq, new Date().toISOString()],
          );
        }

        const after = await db.getAll<{ c: number }>(
          "SELECT COUNT(*) as c FROM spike_test",
        );
        const afterCount = after[0]?.c ?? 0;
        await invoke("spike_log", {
          message: `AFTER_INSERT run_id=${runId} count=${afterCount} (inserted ${ROWS_PER_RUN})`,
        });

        const runs = await db.getAll<{ run_id: string; n: number }>(
          "SELECT run_id, COUNT(*) as n FROM spike_test GROUP BY run_id ORDER BY MIN(created_at)",
        );
        await invoke("spike_log", {
          message: `RUN_BREAKDOWN ${JSON.stringify(runs)}`,
        });

        setSpikeStatus(
          `before=${beforeCount} after=${afterCount} runId=${runId}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.stack || err.message : String(err);
        await invoke("spike_log", { message: `SPIKE_ERROR ${msg}` }).catch(() => {});
        setSpikeStatus(`ERROR: ${msg}`);
      }
    })();
  }, []);

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>
      <p data-testid="spike-status">PowerSync spike status: {spikeStatus}</p>

      <div className="row">
        <a href="https://vite.dev" target="_blank">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <p>Click on the Tauri, Vite, and React logos to learn more.</p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Greet</button>
      </form>
      <p>{greetMsg}</p>
    </main>
  );
}

export default App;
