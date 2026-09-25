import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    // Prefer branded Chrome when installed (CI); fall back to the bundled
    // Chromium so contributors without Chrome can still run E2E locally.
    ...(needsChromeChannel() ? { channel: 'chrome' } : {}),
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

/**
 * Branded Chrome is only guaranteed in CI (`.github/workflows/ci.yml` runs
 * `npx playwright install --with-deps`, and the previous config hardcoded
 * `channel: 'chrome'`). Detect its availability instead of crashing when the
 * binary is missing on contributor machines.
 */
function needsChromeChannel(): boolean {
  if (process.env.CI) return true;
  try {
    const paths = [
      '/opt/google/chrome/chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ];
    // Lazy require keeps this config usable from any runner.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    return paths.some((p) => fs.existsSync(p));
  } catch {
    return false;
  }
}
