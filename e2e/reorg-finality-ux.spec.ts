import { test, expect } from '@playwright/test';

/**
 * V2-FE-144 — E2E: reorg / finality UX against the real app bundle.
 *
 * The dashboard is driven end to end: the canonical `ROLLBACK` event is
 * injected through a test-only `window.WebSocket` stub installed via
 * `addInitScript`. The stub lives only in this spec — nothing is imported by
 * the production bundle, so no mocks can leak into production.
 *
 * Covered journey:
 *  1. No fabricated uncertainty before any event (banner absent).
 *  2. A validated ROLLBACK surfaces the assertive reorg banner live region.
 *  3. The acknowledge control is keyboard reachable and hides the banner.
 *  4. REPLACEMENT carries its own cursor and updates the replacement link.
 */

const ORPHANED = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REPLACEMENT = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

type EmittedEvent = {
  type: string;
  payload: unknown;
  timestamp: string;
  cursor?: string;
};

/**
 * Install the test-only WebSocket stub BEFORE app code runs.
 * The app connects on mount; the stub records the instance and exposes an
 * emit helper on `window.__tbTest` that the test drives from Node.
 */
const INSTALL_STUB = `
  (() => {
    const instances = [];
    class StubWebSocket {
      constructor(url) {
        this.url = url;
        this.readyState = 0;
        instances.push(this);
        setTimeout(() => {
          this.readyState = 1;
          if (this.onopen) this.onopen({});
        }, 0);
      }
      send() {}
      close() {
        this.readyState = 3;
        if (this.onclose) this.onclose({ wasClean: true });
      }
      addEventListener(type, handler) {
        if (type === 'open') this.onopen = handler;
        if (type === 'message') this.onmessage = handler;
        if (type === 'close') this.onclose = handler;
      }
      removeEventListener() {}
    }
    window.WebSocket = StubWebSocket;
    window.__tbTest = {
      instances,
      emit(event) {
        const data = JSON.stringify(event);
        for (const instance of instances) {
          if (instance.onmessage) instance.onmessage({ data });
        }
      },
    };
    window.dispatchEvent(new Event('stub-ready'));
  })();
`;

async function emitEvent(page: import('@playwright/test').Page, event: Omit<EmittedEvent, 'timestamp'>) {
  await page.evaluate((evt) => {
    (window as any).__tbTest.emit({ ...evt, timestamp: new Date().toISOString() });
  }, event);
}

test.describe('V2-FE-144 — reorg/finality UX end to end', () => {
  let page: import('@playwright/test').Page;

  test.beforeEach(async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(INSTALL_STUB);
    page = await context.newPage();
    await page.goto('/');
    // Wait for the stub connection to be open before continuing.
    await page.waitForFunction(
      () => (window as any).__tbTest?.instances?.some((ws: any) => ws.readyState === 1),
      null,
      { timeout: 20_000 },
    );
    // Wait for hydration, then let post-connect effects (typed subscriptions)
    // flush so emitted events are guaranteed to reach the reconciliation hook.
    await expect(page.locator('#main-content')).toBeVisible();
    await page.waitForTimeout(300);
  });

  test.afterEach(async () => {
    await page.context().close();
  });

  test('dashboard loads without fabricated uncertainty (no banner)', async () => {
    await expect(page.getByTestId('reorg-banner')).toHaveCount(0);
  });

  test('validated ROLLBACK surfaces the assertive reorg banner', async () => {
    await emitEvent(page, {
      type: 'ROLLBACK',
      payload: { lastValidCursor: 'cursor-1', blockNumber: 100, affectedClaimIds: ['claim-1'] },
      cursor: 'cursor-0',
    });

    const banner = page.getByTestId('reorg-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('role', 'alert');
    await expect(banner).toHaveAttribute('aria-live', 'assertive');
    await expect(page.getByTestId('reorg-banner-message')).toContainText(/reorganization detected/i);
    await expect(page.getByTestId('reorg-banner-detail')).toContainText(/canonical data/i);
  });

  test('acknowledge is keyboard reachable and hides the banner', async () => {
    await emitEvent(page, {
      type: 'ROLLBACK',
      payload: { lastValidCursor: 'cursor-1', blockNumber: 100 },
    });

    const banner = page.getByTestId('reorg-banner');
    await expect(banner).toBeVisible();

    const button = page.getByTestId('reorg-banner-acknowledge');
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(banner).toHaveCount(0);
  });

  test('REPLACEMENT after ROLLBACK reports the canonical replacement hash', async () => {
    await emitEvent(page, {
      type: 'ROLLBACK',
      payload: { lastValidCursor: 'cursor-1', blockNumber: 100 },
    });
    await emitEvent(page, {
      type: 'REPLACEMENT',
      payload: {
        claimId: 'claim-1',
        newData: { txHash: REPLACEMENT },
        previousCursor: 'cursor-1',
        newCursor: 'cursor-2',
        blockNumber: 101,
      },
    });

    const link = page.getByTestId('reorg-banner-replacement-link');
    await expect(link).toBeVisible();
    expect(await link.getAttribute('href')).toContain(REPLACEMENT);
    expect(await link.getAttribute('rel')).toBe('noopener noreferrer');
    // Orphaned hash not shown: no transaction was tracked in this journey.
    await expect(page.getByTestId('reorg-banner')).not.toContainText(ORPHANED.slice(2, 10));
  });

  test('malformed ROLLBACK fails closed with unresolved guidance', async () => {
    await emitEvent(page, {
      type: 'ROLLBACK',
      payload: { blockNumber: 'not-a-number' },
    });

    const banner = page.getByTestId('reorg-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-state', 'unresolved');
    await expect(page.getByTestId('reorg-banner-detail')).toContainText(/stale/i);
  });
});
