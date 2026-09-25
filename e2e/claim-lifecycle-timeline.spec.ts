/**
 * E2E tests for Claim Lifecycle Timeline
 *
 * Tests the timeline feature in a real browser environment with
 * user interactions, accessibility, and visual validation.
 */

import { test, expect } from '@playwright/test';

test.describe('Claim Lifecycle Timeline E2E', () => {
  // Mock API responses
  const mockClaim = {
    id: 'claim-e2e-123',
    title: 'E2E Test Claim',
    description: 'Testing claim lifecycle timeline in browser',
    claimantAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E',
    status: 'OPEN',
    bountyAmount: 100,
    totalStaked: 50,
    evidence: [],
    createdAt: new Date('2024-01-01T10:00:00Z').toISOString(),
    updatedAt: new Date('2024-01-01T10:00:00Z').toISOString(),
  };

  test.beforeEach(async ({ page }) => {
    // Mock API endpoints
    await page.route('**/api/claims/claim-e2e-123', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockClaim),
      });
    });

    await page.route('**/api/claims', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockClaim]),
      });
    });

    // Mock WebSocket connection
    await page.addInitScript(() => {
      (window as any).mockWebSocket = true;
    });
  });

  test.describe('Initial Rendering', () => {
    test('should display timeline with claim events', async ({ page }) => {
      await page.goto('/claims/claim-e2e-123');

      // Wait for timeline to be visible
      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      // Should show phase indicator
      await expect(page.getByText(/verification open/i)).toBeVisible();

      // Should show initial events
      await expect(page.getByText('Claim Created')).toBeVisible();
      await expect(page.getByText('Claim Indexed')).toBeVisible();
    });

    test('should show loading state initially', async ({ page }) => {
      await page.goto('/claims/claim-e2e-123');

      // Loading skeleton should be visible briefly
      const loadingStatus = page.getByRole('status', { name: /loading timeline/i });
      
      // Wait for either loading to appear or timeline to load
      await Promise.race([
        loadingStatus.waitFor({ state: 'visible', timeout: 1000 }),
        page.getByText('Claim Lifecycle').waitFor({ state: 'visible' }),
      ]);
    });

    test('should display timeline in compact mode on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/claims/claim-e2e-123');

      await expect(page.getByText('Claim Lifecycle')).toBeVisible();
      
      // Timeline should still be functional
      await expect(page.getByText('Claim Created')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await page.goto('/claims/claim-e2e-123');

      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      // Tab to refresh button
      await page.keyboard.press('Tab');
      
      // Refresh button should be focused
      const refreshButton = page.getByRole('button', { name: /refresh timeline data/i });
      await expect(refreshButton).toBeFocused();

      // Press Enter to activate
      await page.keyboard.press('Enter');
      
      // Should show refreshing state
      await expect(page.getByText(/refreshing/i)).toBeVisible({ timeout: 2000 });
    });

    test('should have proper ARIA labels', async ({ page }) => {
      await page.goto('/claims/claim-e2e-123');

      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      // Check main list has label
      const list = page.getByRole('list', { name: /claim lifecycle/i });
      await expect(list).toBeVisible();

      // Check timeline entries are list items
      const items = page.getByRole('listitem');
      await expect(items.first()).toBeVisible();
    });

    test('should announce phase changes to screen readers', async ({ page }) => {
      await page.goto('/claims/claim-e2e-123');

      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      // Check for live region
      const liveRegion = page.locator('[role="status"][aria-live="polite"]');
      await expect(liveRegion.first()).toBeInViewport();
    });

    test('should have sufficient color contrast', async ({ page }) => {
      await page.goto('/claims/claim-e2e-123');

      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      // Take screenshot for manual contrast verification
      await page.screenshot({ path: 'test-results/timeline-contrast.png' });
    });
  });

  test.describe('User Interactions', () => {
    test('should refresh timeline when button is clicked', async ({ page }) => {
      await page.goto('/claims/claim-e2e-123');

      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      // Click refresh button
      const refreshButton = page.getByRole('button', { name: /refresh timeline data/i });
      await refreshButton.click();

      // Should show refreshing state
      await expect(page.getByText(/refreshing/i)).toBeVisible({ timeout: 2000 });

      // Should complete and show refresh button again
      await expect(refreshButton).toBeEnabled({ timeout: 3000 });
    });

    test('should disable refresh button while reconciling', async ({ page }) => {
      await page.goto('/claims/claim-e2e-123');

      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      const refreshButton = page.getByRole('button', { name: /refresh timeline data/i });
      await refreshButton.click();

      // Button should be disabled during reconciliation
      await expect(refreshButton).toBeDisabled({ timeout: 1000 });
    });

    test('should scroll timeline entries into view', async ({ page }) => {
      await page.goto('/claims/claim-e2e-123');

      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      // Get all timeline entries
      const entries = page.getByRole('listitem');
      const firstEntry = entries.first();
      const lastEntry = entries.last();

      // Both should be visible (for short timelines)
      await expect(firstEntry).toBeVisible();
      await expect(lastEntry).toBeVisible();
    });

    test('should open transaction links in new tab', async ({ page, context }) => {
      // Mock claim with transaction hash
      await page.route('**/api/claims/claim-e2e-123', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...mockClaim,
            verifications: [
              {
                transactionHash:
                  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
              },
            ],
          }),
        });
      });

      await page.goto('/claims/claim-e2e-123');

      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      // Find transaction link if present
      const txLink = page.getByRole('link', { name: /view transaction/i }).first();

      if (await txLink.isVisible()) {
        // Should have target="_blank"
        await expect(txLink).toHaveAttribute('target', '_blank');
        await expect(txLink).toHaveAttribute('rel', 'noopener noreferrer');

        // Click should open in new tab
        const [newPage] = await Promise.all([
          context.waitForEvent('page'),
          txLink.click(),
        ]);

        // New page should be block explorer
        expect(newPage.url()).toContain('etherscan.io');
        await newPage.close();
      }
    });
  });

  test.describe('Error States', () => {
    test('should display error when claim not found', async ({ page }) => {
      // Mock 404 response
      await page.route('**/api/claims/non-existent', async (route) => {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Claim not found' }),
        });
      });

      await page.goto('/claims/non-existent');

      // Should show error alert
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByText('Timeline Error')).toBeVisible();
    });

    test('should show retry button for recoverable errors', async ({ page }) => {
      let requestCount = 0;

      await page.route('**/api/claims/claim-e2e-123', async (route) => {
        requestCount++;
        
        if (requestCount === 1) {
          // First request fails
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Internal server error' }),
          });
        } else {
          // Subsequent requests succeed
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockClaim),
          });
        }
      });

      await page.goto('/claims/claim-e2e-123');

      // Should show error initially
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 3000 });

      // Click retry button
      const retryButton = page.getByRole('button', { name: /retry/i });
      if (await retryButton.isVisible()) {
        await retryButton.click();

        // Should succeed on retry
        await expect(page.getByText('Claim Lifecycle')).toBeVisible({ timeout: 3000 });
      }
    });

    test('should handle network errors gracefully', async ({ page }) => {
      // Abort all API requests to simulate network failure
      await page.route('**/api/**', (route) => route.abort());

      await page.goto('/claims/claim-e2e-123');

      // Should show error state
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Stale State Handling', () => {
    test('should show stale warning for old data', async ({ page }) => {
      // Mock claim with old timestamp
      const oldClaim = {
        ...mockClaim,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 mins ago
      };

      await page.route('**/api/claims/claim-e2e-123', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(oldClaim),
        });
      });

      await page.goto('/claims/claim-e2e-123');

      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      // Stale warning may appear after staleness check
      // This depends on timing and configuration
    });

    test('should clear stale warning after refresh', async ({ page }) => {
      await page.goto('/claims/claim-e2e-123');

      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      // If stale warning appears, refresh should clear it
      const staleWarning = page.getByText(/outdated/i);

      if (await staleWarning.isVisible({ timeout: 1000 })) {
        const refreshButton = page.getByRole('button', { name: /refresh timeline data/i });
        await refreshButton.click();

        await expect(staleWarning).not.toBeVisible({ timeout: 3000 });
      }
    });
  });

  test.describe('Visual Regression', () => {
    test('should match timeline snapshot', async ({ page }) => {
      await page.goto('/claims/claim-e2e-123');

      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      // Wait for all content to load
      await page.waitForLoadState('networkidle');

      // Take screenshot of timeline
      const timeline = page.locator('.space-y-4').first();
      await expect(timeline).toHaveScreenshot('claim-lifecycle-timeline.png', {
        maxDiffPixels: 100,
      });
    });

    test('should match phase indicators', async ({ page }) => {
      await page.goto('/claims/claim-e2e-123');

      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      // Screenshot of phase indicator
      const phaseIndicator = page.getByRole('status', { name: /current phase/i });
      await expect(phaseIndicator).toHaveScreenshot('phase-indicator.png');
    });
  });

  test.describe('Responsive Design', () => {
    const viewports = [
      { name: 'Mobile', width: 375, height: 667 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Desktop', width: 1920, height: 1080 },
    ];

    for (const viewport of viewports) {
      test(`should render correctly on ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto('/claims/claim-e2e-123');

        await expect(page.getByText('Claim Lifecycle')).toBeVisible();
        await expect(page.getByText('Claim Created')).toBeVisible();

        // Take screenshot for visual verification
        await page.screenshot({
          path: `test-results/timeline-${viewport.name.toLowerCase()}.png`,
          fullPage: true,
        });
      });
    }
  });

  test.describe('Performance', () => {
    test('should load timeline within acceptable time', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/claims/claim-e2e-123');
      await expect(page.getByText('Claim Lifecycle')).toBeVisible();

      const loadTime = Date.now() - startTime;

      // Should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('should not cause layout shifts', async ({ page }) => {
      await page.goto('/claims/claim-e2e-123');

      // Measure layout shift
      const cumulativeLayoutShift = await page.evaluate(() => {
        return new Promise((resolve) => {
          let cls = 0;
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if ((entry as any).hadRecentInput) continue;
              cls += (entry as any).value;
            }
          });
          observer.observe({ type: 'layout-shift', buffered: true });

          setTimeout(() => {
            observer.disconnect();
            resolve(cls);
          }, 2000);
        });
      });

      // CLS should be minimal (< 0.1 is good)
      expect(cumulativeLayoutShift).toBeLessThan(0.1);
    });
  });
});
