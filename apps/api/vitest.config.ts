import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    // All integration test files share one physical Postgres database and
    // each truncates all tables in its own beforeEach - running files in
    // parallel races two files' truncates/inserts against each other
    // (confirmed: adding a second integration test file caused foreign-key
    // violations from a concurrently-truncated table). Sequential file
    // execution trades a bit of wall-clock time for actual correctness.
    fileParallelism: false,
    // Deliberately a separate database from dev (pos_saas) - integration
    // tests truncate all tables between runs, and must never touch
    // hand-seeded dev data.
    env: {
      DATABASE_URI: 'postgres://pos_admin:dev_only_change_me@localhost:5433/pos_saas_test',
      PAYLOAD_SECRET: 'test_only_secret',
    },
  },
  resolve: {
    alias: {
      '@payload-config': path.resolve(import.meta.dirname, './src/payload.config.ts'),
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
