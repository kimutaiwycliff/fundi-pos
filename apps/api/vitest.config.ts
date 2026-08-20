import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
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
