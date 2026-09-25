/**
 * ClaimRewardsPanel — V2-FE-060 component tests
 *
 * Tests every async UI state: loading (skeleton), idle/empty, claimable,
 * confirming, success (with explorer link), error/recovery, and the
 * fail-closed unsupported state.  Keyboard interaction and ARIA attributes
 * are verified for every interactive surface.
 *
 * The useRewards hook is mocked at the boundary so this test file covers
 * only the component's rendering and interaction behaviour, not the claim
 * lifecycle itself (that is in the integration test and hook unit test).
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Stable dependency mocks
// ---------------------------------------------------------------------------

jest.mock('@/lib/explorer', () => ({
  getTransactionExplorerUrl: (hash: string, chainId?: number) =>
    `https://sepolia-optimism.etherscan.io/tx/${hash}`,
}));

jest.mock('@/components/skeletons', () => ({
  ClaimRewardsPanelSkeleton: () => (
    <div data-testid="rewards-skeleton" role="status" aria-label="Loading rewards">
      Loading…
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Controllable hook mock
// ---------------------------------------------------------------------------

type MockRewardsState = {
  pendingRewards: Array<{
    claimId: string;
    title: string;
    category: string;
    categoryExplanation: string;
    amountRaw: string;
    amountFormatted: string;
    asset: string;
  }>;
  totalClaimableDisplay: string | null;
  status: 'idle' | 'loading' | 'confirming' | 'success' | 'error';
  lastTxHash: `0x${string}` | null;
  errorMessage: string | null;
  isUnsupported: boolean;
  unsupportedReason: string | null;
  claimAll: jest.Mock;
  reset: jest.Mock;
};

const TX = `0x${'e'.repeat(64)}` as `0x${string}`;

let mockState: MockRewardsState;

jest.mock('@/hooks/useRewards', () => ({
  useRewards: () => mockState,
}));

function makeReward(overrides: Partial<MockRewardsState['pendingRewards'][number]> = {}) {
  return {
    claimId: `0x${'a'.repeat(64)}`,
    title: 'Verification reward',
    category: 'verification_reward',
    categoryExplanation:
      'Paid for casting a verification that matched the finalized outcome.',
    amountRaw: '1000000000000000000',
    amountFormatted: '1.0',
    asset: '0x1111111111111111111111111111111111111111',
    ...overrides,
  };
}

function resetMock(): MockRewardsState {
  return {
    pendingRewards: [],
    totalClaimableDisplay: null,
    status: 'idle',
    lastTxHash: null,
    errorMessage: null,
    isUnsupported: false,
    unsupportedReason: null,
    claimAll: jest.fn(),
    reset: jest.fn(),
  };
}

async function renderPanel(props: { isLoading?: boolean } = {}) {
  const ClaimRewardsPanel = (await import('@/components/features/ClaimRewardsPanel')).default;
  return render(<ClaimRewardsPanel {...props} />);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockState = resetMock();
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('ClaimRewardsPanel — loading state', () => {
  it('renders the skeleton while status is loading', async () => {
    mockState.status = 'loading';
    await renderPanel();
    expect(screen.getByTestId('rewards-skeleton')).toBeInTheDocument();
    // No interactive elements while loading
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders the skeleton when the externalLoading prop is true regardless of hook status', async () => {
    mockState.status = 'idle';
    await renderPanel({ isLoading: true });
    expect(screen.getByTestId('rewards-skeleton')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Empty / idle state
// ---------------------------------------------------------------------------

describe('ClaimRewardsPanel — empty / idle state', () => {
  it('renders the panel header', async () => {
    await renderPanel();
    expect(screen.getByText('Claimable Rewards')).toBeInTheDocument();
    expect(screen.getByText('Earned from verified claims')).toBeInTheDocument();
  });

  it('shows the empty-state message with an explanation', async () => {
    await renderPanel();
    expect(screen.getByText('No unclaimed rewards')).toBeInTheDocument();
    expect(
      screen.getByText(/Rewards appear here once your verified claims are settled/i),
    ).toBeInTheDocument();
  });

  it('renders a disabled Claim Rewards button in the empty state', async () => {
    await renderPanel();
    const btn = screen.getByRole('button', { name: /claim rewards/i });
    expect(btn).toBeDisabled();
    expect(btn).not.toHaveAttribute('aria-busy', 'true');
  });

  it('shows "0" as the total when there are no claimable rewards', async () => {
    await renderPanel();
    // totalClaimableDisplay is null → falls back to "0" in the component
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Claimable (idle with rewards) state
// ---------------------------------------------------------------------------

describe('ClaimRewardsPanel — claimable state', () => {
  it('lists each reward with its allocation category explanation and formatted amount', async () => {
    mockState.pendingRewards = [makeReward()];
    mockState.totalClaimableDisplay = '1.0 × 0x11111…';
    await renderPanel();

    expect(
      screen.getByText(/Paid for casting a verification that matched the finalized outcome/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/verification reward/i)).toBeInTheDocument();
    expect(screen.getByText('+1.0')).toBeInTheDocument();
  });

  it('shows the total claimable display string in the header', async () => {
    mockState.pendingRewards = [makeReward()];
    mockState.totalClaimableDisplay = '1.0 × 0x11111…';
    await renderPanel();
    expect(screen.getByText('1.0 × 0x11111…')).toBeInTheDocument();
  });

  it('enables the Claim Rewards button when rewards exist', async () => {
    mockState.pendingRewards = [makeReward()];
    await renderPanel();
    expect(screen.getByRole('button', { name: /claim rewards/i })).not.toBeDisabled();
  });

  it('calls claimAll when the button is clicked', async () => {
    mockState.pendingRewards = [makeReward()];
    await renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /claim rewards/i }));
    expect(mockState.claimAll).toHaveBeenCalledTimes(1);
  });

  it('renders multiple rewards as a list', async () => {
    mockState.pendingRewards = [
      makeReward({ claimId: `0x${'a'.repeat(64)}`, category: 'verification_reward' }),
      makeReward({
        claimId: `0x${'b'.repeat(64)}`,
        category: 'stake_winnings',
        categoryExplanation: "Your proportional share of the losing side's staked amount.",
        amountFormatted: '0.5',
      }),
    ];
    await renderPanel();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Confirming state
// ---------------------------------------------------------------------------

describe('ClaimRewardsPanel — confirming state', () => {
  it('disables the claim button and shows a spinner while confirming', async () => {
    mockState.pendingRewards = [makeReward()];
    mockState.status = 'confirming';
    await renderPanel();

    const btn = screen.getByRole('button', { name: /claiming/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the waiting-for-confirmation status message in the live region', async () => {
    mockState.pendingRewards = [makeReward()];
    mockState.status = 'confirming';
    await renderPanel();
    expect(screen.getByText(/waiting for on-chain confirmation/i)).toBeInTheDocument();
  });

  it('the status live region has role=status and aria-live=polite', async () => {
    mockState.status = 'confirming';
    const { container } = await renderPanel();
    const region = container.querySelector('#rewards-claim-status');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
  });
});

// ---------------------------------------------------------------------------
// Success state
// ---------------------------------------------------------------------------

describe('ClaimRewardsPanel — success state', () => {
  it('shows a "Claimed!" label on the button after confirmation', async () => {
    mockState.status = 'success';
    mockState.lastTxHash = TX;
    await renderPanel();
    // The button text changes to "Claimed!" with a check icon
    expect(screen.getByRole('button', { name: /claimed/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /claimed/i })).toBeDisabled();
  });

  it('renders the confirmed transaction message with an explorer link', async () => {
    mockState.status = 'success';
    mockState.lastTxHash = TX;
    await renderPanel();

    expect(screen.getByText(/transaction confirmed/i)).toBeInTheDocument();

    const links = screen.getAllByRole('link', { name: /view on explorer/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    links.forEach((link) => {
      expect(link).toHaveAttribute(
        'href',
        `https://sepolia-optimism.etherscan.io/tx/${TX}`,
      );
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('explorer link includes an accessible name mentioning the hash', async () => {
    mockState.status = 'success';
    mockState.lastTxHash = TX;
    await renderPanel();
    const link = screen.getByRole('link', { name: /transaction hash/i });
    expect(link).toHaveAttribute('href', expect.stringContaining(TX));
  });
});

// ---------------------------------------------------------------------------
// Error / recovery state
// ---------------------------------------------------------------------------

describe('ClaimRewardsPanel — error and recovery state', () => {
  it('shows the error message in the status footer', async () => {
    mockState.status = 'error';
    mockState.errorMessage = 'Claim transaction reverted on-chain.';
    await renderPanel();
    expect(screen.getByText('Claim transaction reverted on-chain.')).toBeInTheDocument();
  });

  it('renders a Dismiss button in the error state', async () => {
    mockState.status = 'error';
    mockState.errorMessage = 'Claim failed.';
    await renderPanel();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('calls reset() when Dismiss is clicked', async () => {
    mockState.status = 'error';
    mockState.errorMessage = 'Claim failed.';
    await renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(mockState.reset).toHaveBeenCalledTimes(1);
  });

  it('renders a Retry label on the primary button in the error state', async () => {
    mockState.status = 'error';
    mockState.pendingRewards = [makeReward()];
    await renderPanel();
    // The primary button shows "Retry" when status is error and rewards exist
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('clears error state after reset and returns to idle idle', async () => {
    mockState.status = 'error';
    mockState.errorMessage = 'rpc down';
    const rendered = await renderPanel();

    expect(screen.getByText('rpc down')).toBeInTheDocument();

    // Simulate reset: update mock state and rerender
    mockState = { ...mockState, status: 'idle', errorMessage: null };
    const ClaimRewardsPanel = (await import('@/components/features/ClaimRewardsPanel')).default;
    rendered.rerender(<ClaimRewardsPanel />);

    await waitFor(() => {
      expect(screen.queryByText('rpc down')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /claim rewards/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Fail-closed (unsupported) state
// ---------------------------------------------------------------------------

describe('ClaimRewardsPanel — fail-closed unsupported state', () => {
  it('renders the unsupported reason message', async () => {
    mockState.isUnsupported = true;
    mockState.unsupportedReason = 'Connect your wallet to view claimable rewards.';
    await renderPanel();
    expect(
      screen.getByText('Connect your wallet to view claimable rewards.'),
    ).toBeInTheDocument();
  });

  it('does NOT render a Claim Rewards button when unsupported', async () => {
    mockState.isUnsupported = true;
    mockState.unsupportedReason = 'Wrong network.';
    await renderPanel();
    expect(
      screen.queryByRole('button', { name: /claim rewards/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the panel header even in the unsupported state', async () => {
    mockState.isUnsupported = true;
    mockState.unsupportedReason = 'Connect your wallet to view claimable rewards.';
    await renderPanel();
    expect(screen.getByText('Claimable Rewards')).toBeInTheDocument();
  });

  it('uses a polite live region to surface the unsupported reason', async () => {
    mockState.isUnsupported = true;
    mockState.unsupportedReason = 'Wrong network. Switch to the protocol chain.';
    const { container } = await renderPanel();
    const region = container.querySelector('[role="status"][aria-live="polite"]');
    expect(region).toBeInTheDocument();
    expect(region?.textContent).toContain('Wrong network');
  });
});

// ---------------------------------------------------------------------------
// Keyboard interaction
// ---------------------------------------------------------------------------

describe('ClaimRewardsPanel — keyboard interaction', () => {
  it('invokes claimAll via Enter when the button is focused', async () => {
    mockState.pendingRewards = [makeReward()];
    await renderPanel();

    const btn = screen.getByRole('button', { name: /claim rewards/i });
    btn.focus();
    expect(btn).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(mockState.claimAll).toHaveBeenCalledTimes(1);
  });

  it('invokes claimAll via Space when the button is focused', async () => {
    mockState.pendingRewards = [makeReward()];
    await renderPanel();

    const btn = screen.getByRole('button', { name: /claim rewards/i });
    btn.focus();
    await userEvent.keyboard(' ');
    expect(mockState.claimAll).toHaveBeenCalledTimes(1);
  });

  it('does not invoke claimAll when the button is disabled (no rewards)', async () => {
    await renderPanel();
    const btn = screen.getByRole('button', { name: /claim rewards/i });
    expect(btn).toBeDisabled();
    btn.focus();
    await userEvent.keyboard('{Enter}');
    expect(mockState.claimAll).not.toHaveBeenCalled();
  });

  it('focuses the Dismiss button and invokes reset() via keyboard', async () => {
    mockState.status = 'error';
    mockState.errorMessage = 'Claim failed.';
    await renderPanel();

    const dismiss = screen.getByRole('button', { name: /dismiss/i });
    dismiss.focus();
    await userEvent.keyboard('{Enter}');
    expect(mockState.reset).toHaveBeenCalledTimes(1);
  });

  it('allows tab navigation between claim button and explorer link in success state', async () => {
    mockState.status = 'success';
    mockState.lastTxHash = TX;
    await renderPanel();

    const claimedBtn = screen.getByRole('button', { name: /claimed/i });
    const explorerLinks = screen.getAllByRole('link');

    // All interactive elements must be in the natural tab order (not tabIndex=-1)
    expect(claimedBtn).not.toHaveAttribute('tabindex', '-1');
    explorerLinks.forEach((link) => {
      expect(link).not.toHaveAttribute('tabindex', '-1');
    });
  });
});

// ---------------------------------------------------------------------------
// ARIA structure
// ---------------------------------------------------------------------------

describe('ClaimRewardsPanel — ARIA structure', () => {
  it('the reward list has an accessible label', async () => {
    mockState.pendingRewards = [makeReward()];
    await renderPanel();
    expect(
      screen.getByRole('list', { name: /claimable reward entitlements/i }),
    ).toBeInTheDocument();
  });

  it('the claim button is described by the status live region', async () => {
    mockState.pendingRewards = [makeReward()];
    await renderPanel();
    const btn = screen.getByRole('button', { name: /claim rewards/i });
    expect(btn).toHaveAttribute('aria-describedby', 'rewards-claim-status');
  });

  it('decorative SVG icons have aria-hidden="true"', async () => {
    const { container } = await renderPanel();
    const svgs = container.querySelectorAll('svg');
    svgs.forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
