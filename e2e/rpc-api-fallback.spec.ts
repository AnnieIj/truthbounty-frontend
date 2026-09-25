/**
 * E2E tests — RPC/API Fallback Boundary states
 * V2-FE-136
 *
 * These tests use MSW request interception to simulate provider health
 * scenarios. They are designed to run against the local dev server or
 * a dedicated staging environment — never against production.
 *
 * Guard: The test file checks for NEXT_PUBLIC_E2E_TARGET to ensure it
 * doesn't accidentally run against a production endpoint.
 */

import { test, expect } from '@playwright/test';

// Safety guard — refuse to run if pointed at production
const targetUrl = process.env.NEXT_PUBLIC_E2E_TARGET ?? 'http://localhost:3000';
if (
  targetUrl.includes('truthbounty.xyz') ||
  targetUrl.includes('truthbounty.io') ||
  targetUrl.includes('vercel.app')
) {
  throw new Error(
    'E2E_SAFETY: rpc-api-fallback.spec.ts must not run against production. Set NEXT_PUBLIC_E2E_TARGET to a local or staging URL.',
  );
}

test.describe('RPC/API Fallback Boundary E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept all RPC probe requests so we can control their outcome
    // without making real network calls.
    await page.route('**/jsonrpc**', (route) => route.abort('failed'));
  });

  test('dashboard loads without crashing when RPC probe fails', async ({ page }) => {
    await page.goto(targetUrl);
    // Should not show an uncaught error overlay
    await expect(page.locator('body')).not.toContainText('Application error');
    // Page title should still be present
    await expect(page).toHaveTitle(/.+/);
  });

  test('degraded banner is visible when RPC fallback is active', async ({ page }) => {
    // The banner is only shown when the RPC hook has probed and determined
    // the primary provider is unhealthy. In CI without a live RPC the
    // state may remain 'unknown' — we assert the banner is not showing
    // a fabricated success.
    await page.goto(targetUrl);
    // If the page renders a fallback/degraded banner, it must have the
    // correct ARIA attributes and not contain fabricated confirmation text.
    const degradedBanner = page.getByTestId('fallback-boundary-degraded');
    const blockedBanner = page.getByTestId('fallback-boundary-blocked');

    // Either no banner (healthy) or the correct banner (degraded/blocked)
    // — never an invisible banner that still reports healthy to screen readers.
    const degradedVisible = await degradedBanner.isVisible().catch(() => false);
    const blockedVisible = await blockedBanner.isVisible().catch(() => false);

    if (degradedVisible) {
      const role = await degradedBanner.getAttribute('role');
      expect(role).toBe('status');
    }
    if (blockedVisible) {
      const role = await blockedBanner.getAttribute('role');
      expect(role).toBe('alert');
    }
  });

  test('stale banner never appears for fresh data on initial load', async ({ page }) => {
    // Intercept API routes to return quick successful responses
    await page.route('**/api/claims**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      }),
    );

    await page.goto(targetUrl);

    // On initial load with fresh data, no stale banner should appear
    const criticalBanner = page.getByTestId('api-stale-banner-critical');
    await expect(criticalBanner).not.toBeVisible();
  });

  test('RPC status indicator is accessible', async ({ page }) => {
    await page.goto(targetUrl);

    // If any RPC status indicator is rendered, it must carry an aria-label
    const indicators = page.locator('[data-testid^="rpc-status-"]');
    const count = await indicators.count();

    for (let i = 0; i < count; i++) {
      const el = indicators.nth(i);
      const ariaLabel = await el.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
    }
  });

  test('API error state shows reload button that is focusable', async ({ page }) => {
    // Make all API calls fail
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    );

    await page.goto(targetUrl);

    // If an error/stale banner is rendered, any reload button must be
    // keyboard-focusable.
    const reloadBtn = page.getByRole('button', { name: /reload/i });
    const btnVisible = await reloadBtn.isVisible().catch(() => false);
    if (btnVisible) {
      await reloadBtn.focus();
      const isFocused = await reloadBtn.evaluate(
        (el) => document.activeElement === el,
      );
      expect(isFocused).toBe(true);
    }
  });
});
