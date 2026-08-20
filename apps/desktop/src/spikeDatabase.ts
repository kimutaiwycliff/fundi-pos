// PowerSync Tauri SDK (native, alpha) offline-storage risk spike.
//
// This intentionally does NOT configure a sync connector: db.connect() from
// JavaScript throws by design in this SDK ("Connecting to the PowerSync
// service is only possible from Rust"). We are only exercising the local
// SQLite read/write path (backed by real Rust + rusqlite on disk, not
// WASM/OPFS/IndexedDB) to answer the risk question: does locally written
// data survive a full process restart?
import { column, Schema, Table } from '@powersync/common';
import { PowerSyncTauriDatabase } from '@powersync/tauri-plugin';
import { appDataDir } from '@tauri-apps/api/path';

const spike_test = new Table({
  run_id: column.text,
  seq: column.integer,
  created_at: column.text,
});

export const SpikeSchema = new Schema({ spike_test });

let dbInstance: PowerSyncTauriDatabase | null = null;

export function getSpikeDb(): PowerSyncTauriDatabase {
  if (!dbInstance) {
    dbInstance = new PowerSyncTauriDatabase({
      schema: SpikeSchema,
      database: {
        dbFilename: 'spike.db',
        dbLocationAsync: appDataDir,
      },
    });
  }
  return dbInstance;
}
