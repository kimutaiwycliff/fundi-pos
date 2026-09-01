import path from 'path';
import { defineConfig } from 'vitest/config';

const DEFAULT_TEST_DATABASE_URI = 'postgres://pos_admin:dev_only_change_me@localhost:5433/pos_saas_test';

// Integration tests truncate every table in their own beforeEach - if
// whatever set DATABASE_URI actually points at the real dev/prod database,
// running these tests silently destroys real data. Caught live: Nx's own
// env-file auto-loading populated process.env.DATABASE_URI from
// apps/api/.env (pos_saas, the hand-seeded dev DB) before this file's old
// bare `??` fallback ever got a chance to apply, and a routine test run
// wiped the dev database's demo data. A hard "must end in _test" guard
// turns that into an immediate, loud failure instead of a silent one - CI's
// own Postgres service is provisioned as pos_saas_test (.github/workflows/
// ci.yml), so this doesn't affect CI.
function resolveDatabaseUri(): string {
  const provided = process.env.DATABASE_URI;
  if (!provided) return DEFAULT_TEST_DATABASE_URI;
  const dbName = provided.split('/').pop()?.split('?')[0] ?? '';
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against database "${dbName}" - DATABASE_URI must point at a *_test database (got: ${provided}).`,
    );
  }
  return provided;
}

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
    // hand-seeded dev data. Falls back to the local dev docker-compose
    // port (5433) when nothing else sets these - CI provides its own
    // DATABASE_URI (a plain postgres:16 service container, no host-port
    // remapping, so port 5432) via .github/workflows/ci.yml's job-level
    // env. Hardcoding this unconditionally previously overrode whatever
    // CI set, so `cannot connect to Postgres` kept happening even after
    // CI's own Postgres service was added - caught live via the actual
    // "ECONNREFUSED ...:5433" error once CI had a real, reachable
    // Postgres on 5432 that this config was never even trying to use.
    env: {
      DATABASE_URI: resolveDatabaseUri(),
      PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ?? 'test_only_secret',
    },
  },
  resolve: {
    alias: {
      '@payload-config': path.resolve(import.meta.dirname, './src/payload.config.ts'),
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
