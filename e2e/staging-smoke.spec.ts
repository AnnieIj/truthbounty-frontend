import { test, expect } from '@playwright/test';

import { STAGING_SMOKE_CONFIG } from '../src/config/staging-smoke';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

// V2-FE-148 — staging smoke gate e2e.
// Drives the canonical staging artifact against the served app and FAILS
// CLOSED when any configured target responds with a non-expected status.
// Mirrors happy-path.spec.ts conventions (best-effort interactions, no app
// rewrites), but asserts the real canonical surface rather than UI chrome.
test('staging smoke: every configured target responds with its expected status', async ({
  page,
}) => {
  for (const target of STAGING_SMOKE_CONFIG.targets) {
    const response = await page.request.get(new URL(target.path, BASE_URL).toString());
    expect(response.status(), `${target.id} (${target.path}) expected ${target.expectedStatus}`).toBe(
      target.expectedStatus,
    );
  }
});

test('staging smoke: home page renders for a real user', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header[role="banner"]')).toBeVisible();
  await expect(page.locator('#main-content')).toBeVisible();
});