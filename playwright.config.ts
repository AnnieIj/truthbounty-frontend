import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    channel: 'chrome',
  },
  webServer: {
    command: 'pnpm start',
    port: 3000,
    reuseExistingServer: true,
    timeout: 60000,
    // Enable the production-excluded E2E harness routes (e.g.
    // /e2e/transactions) for the Playwright server only.
    env: {
      E2E_HARNESS: '1',
    },
  },
});
