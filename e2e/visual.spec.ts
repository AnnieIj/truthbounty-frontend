import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('homepage visual regression', async ({ page }) => {
    // Navigate to homepage
    await page.goto('/');

    // Wait for the main content to be visible to ensure the page has loaded
    await expect(page.locator('header[role="banner"]')).toBeVisible();

    // Give the page time to settle dynamic content (skeletons, layout shifts)
    await page.waitForTimeout(3000);

    // Take a viewport screenshot and compare it with the baseline
    await expect(page).toHaveScreenshot('homepage.png', { maxDiffPixelRatio: 0.1 });
  });

  // Example of capturing specific components, if needed
  test('header component visual regression', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header[role="banner"]');
    await expect(header).toBeVisible();
    await expect(header).toHaveScreenshot('header.png');
  });
});
