import { defineConfig, devices } from '@playwright/test';

// Phase 1 exit criterion (RAD-3 / AST-169): E2E intake tests pass on mobile
// and desktop. Runs against the dev server with fake providers (DEV-003);
// SAC_E2E_EXPOSE_CODES=1 exposes one-time codes to the tests — E2E only,
// never a deployed configuration.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3211',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @stopallcalls/web dev:e2e',
    url: 'http://localhost:3211',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { SAC_E2E_EXPOSE_CODES: '1' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
