import { test, expect } from '@playwright/test';

/**
 * Covers every transaction status the transaction components render
 * (pending / confirming / confirmed / failed) against the production-excluded
 * E2E harness route, asserting each state is presented accessibly and that the
 * failure state exposes its error and a retry affordance.
 *
 * Also covers the confidence and verification-outcome visualization
 * (V2-FE-113): confidence scores and verification outcomes must be projected
 * from canonical chain/API state only, and every documented user-visible
 * outcome (verified / disputed / appealed / inconclusive) must be reachable,
 * accessible, and never fabricate a protocol result.
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

  test('does not fabricate success when the stake signature is rejected', async ({
    page,
  }) => {
    await expect(page.getByText('Stake signature rejected')).toBeVisible();
    await expect(
      txRegion(page).getByText('Rejected', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Signature request was rejected in the wallet'),
    ).toBeVisible();
    await expect(
      txRegion(page).getByText('Confirmed', { exact: true }),
    ).toHaveCount(0);
  });

  test('surfaces a reorged confirmation as recoverable, not confirmed', async ({
    page,
  }) => {
    await expect(page.getByText('Verification reorged')).toBeVisible();
    await expect(
      txRegion(page).getByText('Reorged', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Confirmation was reorged; awaiting re-inclusion'),
    ).toBeVisible();
    await expect(
      txRegion(page).getByText('Confirmed', { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe('confidence and verification outcomes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/transactions');
    await expect(
      page.getByRole('heading', { name: /transaction states/i }),
    ).toBeVisible();
  });

  const confidenceRegion = (page: import('@playwright/test').Page) =>
    page.getByRole('region', { name: /confidence/i });

  test('renders the confidence score from canonical projection state', async ({
    page,
  }) => {
    const region = confidenceRegion(page);
    await expect(region).toBeVisible();

    // Score is presented as an accessible meter with a bounded value.
    const meter = region.getByRole('meter', { name: /confidence score/i });
    await expect(meter).toBeVisible();
    await expect(meter).toHaveAttribute('aria-valuenow', /^\d+$/);
    await expect(meter).toHaveAttribute('aria-valuemin', '0');
    await expect(meter).toHaveAttribute('aria-valuemax', '100');

    const value = Number(await meter.getAttribute('aria-valuenow'));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });

  test('labels the confidence band without inventing an outcome', async ({
    page,
  }) => {
    const region = confidenceRegion(page);
    await expect(
      region.getByText(/low|medium|high/i).first(),
    ).toBeVisible();
    // The projection source is disclosed so users can judge staleness.
    await expect(region.getByText(/source:/i)).toBeVisible();
  });

  test('renders each verification outcome accessibly', async ({ page }) => {
    const outcomes = page.getByRole('region', { name: /verification outcomes/i });
    await expect(outcomes).toBeVisible();

    for (const label of [
      'Verified',
      'Disputed',
      'Appealed',
      'Inconclusive',
    ]) {
      await expect(
        outcomes.getByText(label, { exact: true }),
      ).toBeVisible();
    }
  });

  test('announces the verification outcome status to assistive tech', async ({
    page,
  }) => {
    const status = page.getByRole('status', { name: /verification outcome/i });
    await expect(status).toBeVisible();
    await expect(status).toHaveText(/verified|disputed|appealed|inconclusive/i);
  });

  test('fails closed when confidence data is stale', async ({ page }) => {
    await page.goto('/e2e/transactions?confidence=stale');

    const region = confidenceRegion(page);
    await expect(region).toBeVisible();
    // Stale critical data must not be presented as a fresh score.
    await expect(region.getByText(/stale/i)).toBeVisible();
    await expect(
      region.getByRole('meter', { name: /confidence score/i }),
    ).toHaveCount(0);
  });

  test('fails closed when confidence data is unavailable', async ({ page }) => {
    await page.goto('/e2e/transactions?confidence=unavailable');

    const region = confidenceRegion(page);
    await expect(region).toBeVisible();
    await expect(region.getByText(/unavailable/i)).toBeVisible();
    await expect(
      region.getByRole('meter', { name: /confidence score/i }),
    ).toHaveCount(0);
  });
});
