/**
 * ClaimRewardsPanel — V2-FE-060 component, a11y, and keyboard tests.
 *
 * States covered: loading, empty, loaded/claimable, confirming, success,
 * error/recovery, and the fail-closed unsupported state. Includes axe
 * accessibility assertions and keyboard interaction tests.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { assertAccessible } from '@/__tests__/utils/axe';

jest.mock('@/lib/explorer', () => ({
  getTransactionExplorerUrl: (hash: string) =>
    `https://sepolia-optimism.etherscan.io/tx/${hash}`,
}));

jest.mock('@/components/skeletons', () => ({
  ClaimRewardsPanelSkeleton: () => (
    <div data-testid="rewards-skeleton">Loading rewards…</div>
  ),
}));

type RewardsState = {
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
  receiptProjection: {
    receivedAssets: Array<{ asset: string; amount: bigint }>;
    outstandingClaimIds: string[];
  } | null;
  errorMessage: string | null;
  isLoading: boolean;
  loadError: string | null;
  isUnsupported: boolean;
  unsupportedReason: string | null;
  claimAll: jest.Mock;
  refresh: jest.Mock;
  reset: jest.Mock;
};

const TX_HASH = `0x${'e'.repeat(64)}` as `0x${string}`;
const CLAIM_ID = `0x${'a'.repeat(64)}` as `0x${string}`;

let mockState: RewardsState = {
  pendingRewards: [],
  totalClaimableDisplay: null,
  status: 'idle',
  lastTxHash: null,
  receiptProjection: null,
  errorMessage: null,
  isLoading: false,
  loadError: null,
  isUnsupported: false,
  unsupportedReason: null,
  claimAll: jest.fn(),
  refresh: jest.fn(),
  reset: jest.fn(),
};

jest.mock('@/hooks/useRewards', () => ({
  useRewards: () => mockState,
}));

function aReward() {
  return {
    claimId: CLAIM_ID,
    title: 'Verification reward',
    category: 'verification_reward',
    categoryExplanation:
      'Paid for casting a verification that matched the finalized outcome.',
    amountRaw: '1000000000000000000',
    amountFormatted: '1.0',
    asset: '0x1111111111111111111111111111111111111111',
  };
}

async function renderPanel() {
  const ClaimRewardsPanel = (await import('../ClaimRewardsPanel')).default;
  return render(<ClaimRewardsPanel />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    pendingRewards: [],
    totalClaimableDisplay: null,
    status: 'idle',
    lastTxHash: null,
    receiptProjection: null,
    errorMessage: null,
    isLoading: false,
    loadError: null,
    isUnsupported: false,
    unsupportedReason: null,
    claimAll: jest.fn(),
    refresh: jest.fn(),
    reset: jest.fn(),
  };
});

describe('ClaimRewardsPanel — async states', () => {
  it('renders the skeleton while loading', async () => {
    mockState.status = 'loading';
    await renderPanel();
    expect(screen.getByTestId('rewards-skeleton')).toBeInTheDocument();
  });

  it('renders the empty state with explanation', async () => {
    await renderPanel();
    expect(screen.getByText('No unclaimed rewards')).toBeInTheDocument();
    expect(
      screen.getByText(/Rewards appear here once your verified claims are settled/i),
    ).toBeInTheDocument();
  });

  it('lists entitlements with allocation category explanations and exact amounts', async () => {
    mockState.pendingRewards = [aReward()];
    mockState.totalClaimableDisplay = '1.0 × 0x11111…';
    await renderPanel();

    expect(
      screen.getByText(
        /Paid for casting a verification that matched the finalized outcome/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/verification reward/i)).toBeInTheDocument();
    expect(screen.getByText('+1.0')).toBeInTheDocument();
  });

  it('shows the fail-closed unsupported state with reason and no claim button', async () => {
    mockState.isUnsupported = true;
    mockState.unsupportedReason =
      'Wrong network. Switch to the protocol chain to view claimable rewards.';
    await renderPanel();

    expect(
      screen.getByText(/Wrong network\. Switch to the protocol chain/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /claim rewards/i }),
    ).not.toBeInTheDocument();
  });

  it('shows entitlement load failures with a retry action', async () => {
    mockState.loadError = 'Reward projection service is temporarily unavailable.';
    await renderPanel();

    expect(screen.getByRole('alert')).toHaveTextContent(/projection service/i);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockState.refresh).toHaveBeenCalledTimes(1);
  });

  it('reports receipt transfers and outstanding entitlements after confirmation', async () => {
    mockState.status = 'success';
    mockState.lastTxHash = TX_HASH;
    mockState.receiptProjection = {
      receivedAssets: [
        { asset: '0x1111111111111111111111111111111111111111', amount: 42n },
      ],
      outstandingClaimIds: [CLAIM_ID],
    };
    await renderPanel();

    expect(screen.getByText(/Received 42 from/i)).toBeInTheDocument();
    expect(screen.getByText(/1 entitlement remains outstanding/i)).toBeInTheDocument();
  });

  it('shows a confirming status while the claim waits for its receipt', async () => {
    mockState.pendingRewards = [aReward()];
    mockState.status = 'confirming';
    await renderPanel();

    const status = screen.getByText(/waiting for on-chain confirmation/i);
    expect(status).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /claiming/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the confirmed state with a canonical explorer link only after confirmation', async () => {
    mockState.status = 'success';
    mockState.lastTxHash = TX_HASH;
    await renderPanel();

    const link = screen.getByRole('link', { name: /view on explorer/i });
    expect(link).toHaveAttribute(
      'href',
      `https://sepolia-optimism.etherscan.io/tx/${TX_HASH}`,
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders an error message with a Dismiss recovery action', async () => {
    mockState.status = 'error';
    mockState.errorMessage = 'Claim transaction reverted on-chain.';
    await renderPanel();

    expect(
      screen.getByText('Claim transaction reverted on-chain.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(mockState.reset).toHaveBeenCalledTimes(1);
  });

  it('disabled claim button carries no stale success feedback when idle without rewards', async () => {
    await renderPanel();
    const button = screen.queryByRole('button', { name: /claim rewards/i });
    expect(button).not.toBeNull();
    expect(button).toBeDisabled();
  });
});

describe('ClaimRewardsPanel — keyboard interaction', () => {
  it('claims via keyboard (Enter/Space) when rewards are claimable', async () => {
    mockState.pendingRewards = [aReward()];
    await renderPanel();

    const button = screen.getByRole('button', { name: /claim rewards/i });
    button.focus();
    expect(button).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(mockState.claimAll).toHaveBeenCalledTimes(1);

    await userEvent.keyboard(' ');
    expect(mockState.claimAll).toHaveBeenCalledTimes(2);
  });

  it('does not claim when the button is disabled (empty rewards)', async () => {
    await renderPanel();
    const button = screen.getByRole('button', { name: /claim rewards/i });
    expect(button).toBeDisabled();
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(mockState.claimAll).not.toHaveBeenCalled();
  });

  it('dismisses errors via keyboard', async () => {
    mockState.status = 'error';
    mockState.errorMessage = 'Claim failed.';
    await renderPanel();

    const dismiss = screen.getByRole('button', { name: /dismiss/i });
    dismiss.focus();
    await userEvent.keyboard('{Enter}');
    expect(mockState.reset).toHaveBeenCalledTimes(1);
  });
});

describe('ClaimRewardsPanel — accessibility', () => {
  it('has no axe violations in the idle/empty state', async () => {
    const { container } = await renderPanel();
    await assertAccessible(container);
  });

  it('has no axe violations with claimable rewards', async () => {
    mockState.pendingRewards = [aReward()];
    mockState.totalClaimableDisplay = '1.0 × 0x11111…';
    const { container } = await renderPanel();
    await assertAccessible(container);
  });

  it('has no axe violations while confirming', async () => {
    mockState.pendingRewards = [aReward()];
    mockState.status = 'confirming';
    const { container } = await renderPanel();
    await assertAccessible(container);
  });

  it('has no axe violations in the confirmed state', async () => {
    mockState.status = 'success';
    mockState.lastTxHash = TX_HASH;
    const { container } = await renderPanel();
    await assertAccessible(container);
  });

  it('has no axe violations in the error state', async () => {
    mockState.status = 'error';
    mockState.errorMessage = 'Claim failed.';
    const { container } = await renderPanel();
    await assertAccessible(container);
  });

  it('has no axe violations in the unsupported (fail-closed) state', async () => {
    mockState.isUnsupported = true;
    mockState.unsupportedReason = 'Connect your wallet to view claimable rewards.';
    const { container } = await renderPanel();
    await assertAccessible(container);
  });

  it('announces status changes via a polite live region', async () => {
    mockState.status = 'confirming';
    const { container } = await renderPanel();
    const live = container.querySelector('#rewards-claim-status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveAttribute('role', 'status');
  });

  it('surfaces a stable accessible name for the claim button', async () => {
    mockState.pendingRewards = [aReward()];
    await renderPanel();
    expect(
      screen.getByRole('button', { name: /claim rewards/i }),
    ).toHaveAccessibleName('Claim Rewards');
  });
});

describe('ClaimRewardsPanel — async state recovery (rerender)', () => {
  it('transitions confirming → success → idle without stale content', async () => {
    mockState.pendingRewards = [aReward()];
    mockState.status = 'confirming';
    const rendered = await renderPanel();

    expect(screen.getByText(/waiting for on-chain confirmation/i)).toBeInTheDocument();

    mockState = {
      ...mockState,
      status: 'success',
      lastTxHash: TX_HASH,
    };
    rendered.rerender(<ClaimRewardsPanelWrapper />);
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /view on explorer/i })).toBeInTheDocument();
    });

    mockState = { ...mockState, status: 'idle', lastTxHash: null };
    rendered.rerender(<ClaimRewardsPanelWrapper />);
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /view on explorer/i })).not.toBeInTheDocument();
    });
  });
});

function ClaimRewardsPanelWrapper() {
  // Reads the current mockState through the mocked hook on each render.
  return React.createElement(require('../ClaimRewardsPanel').default);
}
