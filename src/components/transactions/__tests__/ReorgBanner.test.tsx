/**
 * V2-FE-144 — Component + accessibility tests for ReorgBanner.
 *
 * Coverage:
 *  - hidden state renders nothing (no fabricated UI)
 *  - reorg-detected: role=alert, assertive live region, orphaned hash truncated
 *  - replacement-found: canonical explorer link (noopener), both hashes shown
 *  - unresolved: stale-data guidance
 *  - keyboard: acknowledge button reachable and operable via keyboard only
 *  - focus visibility + accessible name
 *  - axe: no violations in any state (uses the project's shared axe config)
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReorgBanner, truncateHash } from '../ReorgBanner';
import type { ReorgBannerView } from '@/lib/reorg-reconciliation';

const ORPHANED = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REPLACEMENT = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function makeView(overrides: Partial<ReorgBannerView> = {}): ReorgBannerView {
  return {
    state: 'hidden',
    message: '',
    detail: '',
    orphanedHash: null,
    replacementHash: null,
    assertive: false,
    ...overrides,
  };
}

describe('ReorgBanner — hidden state', () => {
  it('renders nothing when hidden (no fabricated UI)', () => {
    const { container } = render(<ReorgBanner view={makeView()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('reorg-banner')).not.toBeInTheDocument();
  });
});

describe('ReorgBanner — reorg-detected', () => {
  const view = makeView({
    state: 'reorg-detected',
    message: 'Chain reorganization detected.',
    detail: 'A transaction you submitted was removed from the canonical chain.',
    orphanedHash: ORPHANED,
    assertive: true,
  });

  it('renders an assertive role=alert live region', () => {
    render(<ReorgBanner view={view} />);
    const banner = screen.getByTestId('reorg-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveAttribute('aria-live', 'assertive');
    expect(banner).toHaveAttribute('aria-atomic', 'true');
  });

  it('displays the message and detail', () => {
    render(<ReorgBanner view={view} />);
    expect(screen.getByTestId('reorg-banner-message')).toHaveTextContent(/reorganization detected/i);
    expect(screen.getByTestId('reorg-banner-detail')).toHaveTextContent(/canonical chain/i);
  });

  it('truncates the orphaned hash and carries the full value in the title', () => {
    render(<ReorgBanner view={view} />);
    const truncated = screen.getByTitle(ORPHANED);
    expect(truncated).toHaveTextContent(truncateHash(ORPHANED));
    expect(truncated.textContent!.length).toBeLessThan(ORPHANED.length);
    expect(truncated.textContent).toContain('…');
  });

  it('does not render a replacement link when none exists (never fabricates one)', () => {
    render(<ReorgBanner view={view} />);
    expect(screen.queryByTestId('reorg-banner-replacement-link')).not.toBeInTheDocument();
  });
});

describe('ReorgBanner — replacement-found', () => {
  const view = makeView({
    state: 'replacement-found',
    message: 'Transaction replaced by the canonical chain.',
    detail: 'The original transaction was superseded.',
    orphanedHash: ORPHANED,
    replacementHash: REPLACEMENT,
    assertive: true,
  });

  it('links the canonical replacement to the explorer', () => {
    render(<ReorgBanner view={view} />);
    const link = screen.getByTestId('reorg-banner-replacement-link');
    expect(link).toHaveAttribute('href', `https://optimistic.etherscan.io/tx/${REPLACEMENT}`);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('title', REPLACEMENT);
  });

  it('shows both hashes', () => {
    render(<ReorgBanner view={view} />);
    expect(screen.getByTitle(ORPHANED)).toBeInTheDocument();
    expect(screen.getByTitle(REPLACEMENT)).toBeInTheDocument();
  });
});

describe('ReorgBanner — unresolved', () => {
  it('renders stale-data guidance without hashes', () => {
    const view = makeView({
      state: 'unresolved',
      message: 'Chain reorganization could not be reconciled.',
      detail: 'Recent activity may be stale. Wait for canonical data before acting.',
      assertive: true,
    });
    render(<ReorgBanner view={view} />);
    expect(screen.getByTestId('reorg-banner')).toHaveAttribute('data-state', 'unresolved');
    expect(screen.getByTestId('reorg-banner-detail')).toHaveTextContent(/stale/i);
    expect(screen.queryByTitle(ORPHANED)).not.toBeInTheDocument();
  });
});

describe('ReorgBanner — acknowledge control', () => {
  it('invokes onAcknowledge when clicked', async () => {
    const user = userEvent.setup();
    const onAcknowledge = jest.fn();
    const view = makeView({
      state: 'reorg-detected',
      message: 'Chain reorganization detected.',
      detail: 'detail',
      orphanedHash: ORPHANED,
      assertive: true,
    });
    render(<ReorgBanner view={view} onAcknowledge={onAcknowledge} />);

    const button = screen.getByTestId('reorg-banner-acknowledge');
    expect(button).toHaveTextContent(/acknowledge/i);
    await user.click(button);
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  it('is keyboard operable and focusable', async () => {
    const user = userEvent.setup();
    const onAcknowledge = jest.fn();
    const view = makeView({
      state: 'reorg-detected',
      message: 'msg',
      detail: 'd',
      orphanedHash: ORPHANED,
      assertive: true,
    });
    render(<ReorgBanner view={view} onAcknowledge={onAcknowledge} />);

    const button = screen.getByTestId('reorg-banner-acknowledge');
    await user.tab();
    expect(button).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onAcknowledge).toHaveBeenCalledTimes(1);

    await user.keyboard(' ');
    expect(onAcknowledge).toHaveBeenCalledTimes(2);
  });

  it('hides the acknowledge control when no handler is provided', () => {
    const view = makeView({
      state: 'reorg-detected',
      message: 'm',
      detail: 'd',
      assertive: true,
    });
    render(<ReorgBanner view={view} />);
    expect(screen.queryByTestId('reorg-banner-acknowledge')).not.toBeInTheDocument();
  });
});

describe('ReorgBanner — accessibility (axe)', () => {
  it('has no axe violations in reorg-detected state', async () => {
    const { assertAccessible } = await import('@/__tests__/utils/axe');
    const view = makeView({
      state: 'reorg-detected',
      message: 'Chain reorganization detected.',
      detail: 'A transaction you submitted was removed from the canonical chain.',
      orphanedHash: ORPHANED,
      assertive: true,
    });
    const { container } = render(<ReorgBanner view={view} onAcknowledge={() => {}} />);
    await assertAccessible(container);
  });

  it('has no axe violations in replacement-found state', async () => {
    const { assertAccessible } = await import('@/__tests__/utils/axe');
    const view = makeView({
      state: 'replacement-found',
      message: 'Transaction replaced by the canonical chain.',
      detail: 'The original transaction was superseded.',
      orphanedHash: ORPHANED,
      replacementHash: REPLACEMENT,
      assertive: true,
    });
    const { container } = render(<ReorgBanner view={view} onAcknowledge={() => {}} />);
    await assertAccessible(container);
  });

  it('has no axe violations in unresolved state', async () => {
    const { assertAccessible } = await import('@/__tests__/utils/axe');
    const view = makeView({
      state: 'unresolved',
      message: 'Chain reorganization could not be reconciled.',
      detail: 'Recent activity may be stale.',
      assertive: true,
    });
    const { container } = render(<ReorgBanner view={view} />);
    await assertAccessible(container);
  });
});
