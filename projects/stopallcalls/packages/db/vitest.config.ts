import { defineConfig } from 'vitest/config';

// Plain-node suite only; test-workers/ needs workerd and runs separately via
// `pnpm test:d1` (vitest.workers.config.ts).
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
