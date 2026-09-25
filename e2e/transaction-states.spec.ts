import { test, expect } from '@playwright/test';

/**
 * Covers every transaction status the transaction components render
 * (pending / confirming / confirmed / failed) against the production-excluded
 * E2E harness route, asserting each state is presented accessibly and that the
 * failure state exposes its error and a retry affordance.
 */
test.describe('transaction states', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/transactions');
    await expect(
      page.getByRole('heading', { name: /transaction states/i }),
    ).toBeVisible();
  });

  const txRegion = (page: import('@playwright/test').Page) =>
    page.getByRole('region', { name: 'Transactions' });

  test('renders the pending state', async ({ page }) => {
    await expect(page.getByText('Verification submitted')).toBeVisible();
    await expect(
      txRegion(page).getByText('Pending', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Awaiting inclusion in the mempool'),
    ).toBeVisible();
  });

  test('renders the confirming state with confirmation progress', async ({
    page,
  }) => {
    await expect(page.getByText('Stake confirming')).toBeVisible();
    await expect(
      txRegion(page).getByText('Confirming', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Confirmations: 40%')).toBeVisible();
  });

  test('renders the confirmed state', async ({ page }) => {
    await expect(page.getByText('Withdrawal confirmed')).toBeVisible();
    await expect(
      txRegion(page).getByText('Confirmed', { exact: true }),
    ).toBeVisible();
  });

  test('renders the failed state with error and retry', async ({ page }) => {
    await expect(page.getByText('Dispute reverted')).toBeVisible();
    await expect(
      txRegion(page).getByText('Failed', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('execution reverted: insufficient stake'),
    ).toBeVisible();

    const retry = page.getByRole('button', { name: /retry/i });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(page.getByTestId('last-retried')).toHaveText(/^0xfailed/);
  });

  test('exposes copy and explorer controls per transaction', async ({
    page,
  }) => {
    const copyButtons = page.getByRole('button', { name: /copy hash/i });
    await expect(copyButtons).toHaveCount(4);

    await copyButtons.first().click();
    await expect(page.getByTestId('last-copied')).toHaveText(/^0x/);

    await expect(
      page.getByRole('button', { name: /view on explorer/i }),
    ).toHaveCount(4);
  });

  test('shows the status summary for all four states', async ({ page }) => {
    const summary = page.getByRole('region', { name: /status summary/i });
    for (const label of ['Pending', 'Confirming', 'Confirmed', 'Failed']) {
      await expect(summary.getByText(label, { exact: true })).toBeVisible();
    }
  });
});
