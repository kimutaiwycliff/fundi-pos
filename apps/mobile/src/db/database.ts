import { PowerSyncDatabase } from '@powersync/react-native';
import { AppSchema } from './schema';
import { ApiConnector } from './connector';

// Local PowerSync database for the Android till, mirroring
// apps/desktop/src/database.ts + powersync.ts's connect/disconnect wiring -
// but simpler, since RN's SDK can connect() directly from JS (no Rust-side
// BackendConnector indirection needed the way Tauri required).
let dbInstance: PowerSyncDatabase | null = null;
let connectorInstance: ApiConnector | null = null;

export function getDb(): PowerSyncDatabase {
  if (!dbInstance) {
    dbInstance = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: 'hardware-pos.db' },
    });
  }
  return dbInstance;
}

/**
 * Connects (or reconnects) this till to the PowerSync service, scoped by
 * `storeId` (only meaningful for a user with no fixed store - an owner/
 * manager overseeing multiple branches picking which one to sync right
 * now). Switching branches means calling disconnectPowerSync() then this
 * again with the new id, exactly like a fresh login - there is no "hot"
 * reparameterization of an already-connected sync session (same rule as
 * desktop).
 */
export async function connectPowerSync(payloadToken: string, storeId: number | null): Promise<void> {
  const db = getDb();
  connectorInstance = new ApiConnector(payloadToken, storeId);
  await db.connect(connectorInstance);
  // connect() only opens the connection and starts syncing in the
  // background - it does not wait for any data to actually land locally.
  // Without this, the caller's very next local query (the store picker's
  // own SELECT, or the first screen a user lands on) races the initial
  // sync and can see an empty database - fine and unnoticeable against a
  // fast local dev PowerSync, but very visible over a real network. A hard
  // cap avoids hanging forever if the connection drops mid-sync; the app
  // proceeds either way, same as before this fix for a fully offline resume.
  await Promise.race([db.waitForFirstSync(), new Promise((resolve) => setTimeout(resolve, 30000))]);
}

/** Updates the Payload token the connector uses to mint PowerSync JWTs, without tearing down the sync connection. */
export function refreshPayloadToken(payloadToken: string): void {
  connectorInstance?.setPayloadToken(payloadToken);
}

export async function disconnectPowerSync(): Promise<void> {
  await getDb().disconnect();
  connectorInstance = null;
}
