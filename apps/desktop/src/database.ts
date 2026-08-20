// Real (non-spike) PowerSync local database for the hardware POS till.
//
// This replaces src/spikeDatabase.ts: same underlying mechanism (a
// Rust-owned rusqlite database via @powersync/tauri-plugin, proven in the
// earlier spike to survive a hard process restart), but with the real
// application schema (see ./schema.ts) instead of a throwaway spike_test
// table, and wired up to an actual Rust-side BackendConnector for sync
// (see ./powersync.ts and src-tauri/src/connector.rs) instead of never
// calling connect() at all.
import { PowerSyncTauriDatabase } from '@powersync/tauri-plugin';
import { appDataDir } from '@tauri-apps/api/path';
import { AppSchema } from './schema';

let dbInstance: PowerSyncTauriDatabase | null = null;

export function getDb(): PowerSyncTauriDatabase {
  if (!dbInstance) {
    dbInstance = new PowerSyncTauriDatabase({
      schema: AppSchema,
      database: {
        dbFilename: 'hardware-pos.db',
        dbLocationAsync: appDataDir,
      },
    });
  }
  return dbInstance;
}
