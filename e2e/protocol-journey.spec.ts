import { test, expect } from './support/test';

const EMPTY_STATE =
  'No claims match the current search or filter. Try clearing your search or choosing a different filter.';

const claimsTable = 'table[aria-label="Active claims"]';

test.describe('protocol journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('dashboard renders its landmarks and navigation', async ({ page }) => {
    await expect(page.locator('header[role="banner"]')).toBeVisible();
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.locator('#sidebar-navigation')).toBeVisible();
    await expect(page.getByLabel('Select chain')).toBeVisible();
  });

  test('claims table lists the seeded claims once loading settles', async ({ page }) => {
    const table = page.locator(claimsTable);
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await expect(table).toContainText('New vaccine shows 95% efficacy in Phase 3 trials');
    await expect(table).toContainText('Tech company achieved quantum supremacy milestone');
  });

  test('status filters narrow the table to matching claims', async ({ page }) => {
    const table = page.locator(claimsTable);
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(3);

    await page.getByRole('button', { name: 'Verified', exact: true }).click();
    await expect(rows).toHaveCount(2);
    await expect(table).not.toContainText('Tech company achieved quantum supremacy milestone');

    await page.getByRole('button', { name: 'Under Review', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(table).toContainText('Tech company achieved quantum supremacy milestone');
  });

  test('a filter with no matches shows the empty state', async ({ page }) => {
    const table = page.locator(claimsTable);
    await page.getByRole('button', { name: 'Disputed', exact: true }).click();
    await expect(table).toContainText(EMPTY_STATE);
  });

  test('the active filter is exposed to assistive technology', async ({ page }) => {
    const verified = page.getByRole('button', { name: 'Verified', exact: true });
    const all = page.getByRole('button', { name: 'All', exact: true });

    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await verified.click();
    await expect(verified).toHaveAttribute('aria-pressed', 'true');
    await expect(all).toHaveAttribute('aria-pressed', 'false');
  });

  test('search narrows the table and clearing restores it', async ({ page }) => {
    const table = page.locator(claimsTable);
    const rows = table.locator('tbody tr');
    const search = page.getByLabel('Search claims');

    await search.fill('vaccine');
    await expect(rows).toHaveCount(1);
    await expect(table).toContainText('New vaccine shows 95% efficacy in Phase 3 trials');

    await page.getByLabel('Clear search').click();
    await expect(rows).toHaveCount(3);
    await expect(search).toBeFocused();
  });

  test('search and filter compose rather than override each other', async ({ page }) => {
    const table = page.locator(claimsTable);
    await page.getByRole('button', { name: 'Verified', exact: true }).click();
    await page.getByLabel('Search claims').fill('quantum');
    await expect(table).toContainText(EMPTY_STATE);
  });

  test('a claim exposes a keyboard-reachable action', async ({ page }) => {
    await expect(
      page.getByLabel('View claim: New vaccine shows 95% efficacy in Phase 3 trials'),
    ).toBeVisible();
  });

  test('wallet connection is offered before any protocol action', async ({ page }) => {
    await expect(page.getByRole('button', { name: /connect wallet/i }).first()).toBeVisible();
  });

  test('how it works is reachable from the sidebar', async ({ page }) => {
    await page.getByRole('link', { name: /how it works/i }).first().click();
    await expect(page).toHaveURL(/\/how-it-works$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('an unknown claim id surfaces a not-found state rather than fabricating one', async ({
    page,
  }) => {
    await page.goto('/claims/does-not-exist');
    await expect(page.locator('#main')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('undefined');
  });
});
