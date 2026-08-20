// Bridges the JS-side PowerSyncTauriDatabase to the real Rust-side sync
// connector (src-tauri/src/connector.rs).
//
// Confirmed against @powersync/tauri-plugin's guest-js
// (node_modules/@powersync/tauri-plugin/guest-js/database.ts):
// `PowerSyncTauriDatabase.connect()` unconditionally throws
// "Calling connect() from JavaScript is not supported yet. Instead, call
// connect() in your Rust code." - there is no JS-exposed `Connect` command
// in guest-js/command.ts's `Command` union either. The plugin instead
// exposes `db.rustHandle`, explicitly documented as "used together with
// custom Rust code to share a PowerSync database between JavaScript and
// Rust". So the real connect flow has to go through a custom Tauri command
// that looks the handle back up on the Rust side
// (PowerSync::database_from_javascript_handle, from the tauri-plugin-powersync
// crate source at
// ~/.cargo/registry/src/*/tauri-plugin-powersync-0.0.6/src/lib.rs) and then
// calls the real `powersync` crate's `PowerSyncDatabase::connect(SyncOptions)`
// (~/.cargo/registry/src/*/powersync-0.0.7/src/db/mod.rs) with a Rust
// `BackendConnector` implementation
// (~/.cargo/registry/src/*/powersync-0.0.7/src/sync/connector.rs).
import { invoke } from '@tauri-apps/api/core';
import { getDb } from './database';
import { API_BASE_URL, POWERSYNC_URL, fetchPowerSyncToken } from './auth';

export async function ensureAppDataDir(): Promise<string> {
  return invoke<string>('ensure_app_data_dir');
}

/**
 * Initializes the local database (if not already) and asks the Rust side to
 * connect it to the PowerSync service using `payloadToken` as the
 * credential the Rust connector will use (and re-use on every
 * fetch_credentials() call) to mint fresh PowerSync JWTs from
 * GET /api/powersync/token.
 */
export async function connectPowerSync(payloadToken: string): Promise<void> {
  const db = getDb();
  await db.init();

  // Validate the full credential chain from JS too (fail fast with a
  // readable error before asking Rust to connect).
  await fetchPowerSyncToken(payloadToken);

  await invoke('powersync_connect', {
    rustHandle: db.rustHandle,
    apiBaseUrl: API_BASE_URL,
    powersyncUrl: POWERSYNC_URL,
    payloadToken,
  });
}

/** Updates the Payload token the Rust connector uses to mint PowerSync JWTs. */
export async function refreshPayloadToken(payloadToken: string): Promise<void> {
  const db = getDb();
  await invoke('powersync_update_token', {
    rustHandle: db.rustHandle,
    payloadToken,
  });
}

export async function disconnectPowerSync(): Promise<void> {
  const db = getDb();
  await invoke('powersync_disconnect', { rustHandle: db.rustHandle });
}
