import * as migration_20260825_085003_initial_baseline from './20260825_085003_initial_baseline';

export const migrations = [
  {
    up: migration_20260825_085003_initial_baseline.up,
    down: migration_20260825_085003_initial_baseline.down,
    name: '20260825_085003_initial_baseline'
  },
];
