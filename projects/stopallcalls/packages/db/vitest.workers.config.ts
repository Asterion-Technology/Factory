import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

// Runs test-workers/ inside workerd with a real (miniflare) D1 database, so
// the D1 stores are exercised against actual SQLite semantics + migrations.
export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  return {
    test: {
      include: ['test-workers/**/*.test.ts'],
      setupFiles: ['./test-workers/apply-migrations.ts'],
      poolOptions: {
        workers: {
          miniflare: {
            // Highest date the workerd bundled with pool-workers 0.12.x knows.
            compatibilityDate: '2026-03-10',
            d1Databases: ['DB'],
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
