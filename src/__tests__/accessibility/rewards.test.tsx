/**
 * Accessibility tests — Reward Entitlement and Claim Flow (V2-FE-060)
 *
 * Runs jest-axe (WCAG 2.1 AA rule set) against ClaimRewardsPanel in every
 * async state. Verifies ARIA roles, live-region attributes, and landmark
 * structure for the reward flow components.
 *
 * Note: full WCAG AA compliance requires manual testing with assistive
 * technologies in addition to automated checks.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { assertAccessible } from '../utils/axe';

// ---------------------------------------------------------------------------
// Stable dependency stubs
// ---------------------------------------------------------------------------

jest.mock('@/lib/explorer', () => ({
  getTransactionExplorerUrl: (hash: string) =>
    `https://sepolia-optimism.etherscan.io/tx/${hash}`,
}));

jest.mock('@/components/skeletons', () => ({
  ClaimRewardsPanelSkeleton: () => (
    <div role="status" aria-label="Loading claimable rewards">
      Loading…
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Controllable hook mock
// ---------------------------------------------------------------------------

type RewardEntry = {
  claimId: string;
  title: string;
  category: string;
  categoryExplanation: string;
  amountRaw: string;
  amountFormatted: string;
  asset: string;
};

type MockState = {
  pendingRewards: RewardEntry[];
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

let mockState: MockState;

jest.mock('@/hooks/useRewards', () => ({
  useRewards: () => mockState,
}));

function baseState(): MockState {
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

function makeReward(): RewardEntry {
  return {
    claimId: `0x${'a'.repeat(64)}`,
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
  const ClaimRewardsPanel = (
    await import('@/components/features/ClaimRewardsPanel')
  ).default;
  return render(<ClaimRewardsPanel />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState = baseState();
});

// ---------------------------------------------------------------------------
// axe assertions per state
// ---------------------------------------------------------------------------

describe('ClaimRewardsPanel — axe accessibility (WCAG 2.1 AA)', () => {
  it('has no violations in the idle / empty state', async () => {
    const { container } = await renderPanel();
    await assertAccessible(container);
  });

  it('has no violations while loading (skeleton)', async () => {
    mockState.status = 'loading';
    const { container } = await renderPanel();
    await assertAccessible(container);
  });

  it('has no violations with claimable rewards listed', async () => {
    mockState.pendingRewards = [makeReward()];
    mockState.totalClaimableDisplay = '1.0 × 0x11111…';
    const { container } = await renderPanel();
    await assertAccessible(container);
  });

  it('has no violations in the confirming state', async () => {
    mockState.pendingRewards = [makeReward()];
    mockState.status = 'confirming';
    const { container } = await renderPanel();
    await assertAccessible(container);
  });

  it('has no violations in the success / confirmed state', async () => {
    mockState.status = 'success';
    mockState.lastTxHash = TX;
    const { container } = await renderPanel();
    await assertAccessible(container);
  });

  it('has no violations in the error state', async () => {
    mockState.status = 'error';
    mockState.errorMessage = 'Claim transaction reverted on-chain.';
    const { container } = await renderPanel();
    await assertAccessible(container);
  });

  it('has no violations in the fail-closed (wallet disconnected) state', async () => {
    mockState.isUnsupported = true;
    mockState.unsupportedReason = 'Connect your wallet to view claimable rewards.';
    const { container } = await renderPanel();
    await assertAccessible(container);
  });

  it('has no violations in the fail-closed (wrong network) state', async () => {
    mockState.isUnsupported = true;
    mockState.unsupportedReason =
      'Wrong network. Switch to the protocol chain to view claimable rewards.';
    const { container } = await renderPanel();
    await assertAccessible(container);
  });
});

// ---------------------------------------------------------------------------
// ARIA structure invariants
// ---------------------------------------------------------------------------

describe('ClaimRewardsPanel — ARIA structure invariants', () => {
  it('status live region has role=status and aria-live=polite in confirming state', async () => {
    mockState.status = 'confirming';
    const { container } = await renderPanel();
    const live = container.querySelector('#rewards-claim-status');
    expect(live).not.toBeNull();
    expect(live).toHaveAttribute('role', 'status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveAttribute('aria-atomic', 'true');
  });

  it('claim button carries aria-describedby pointing at the live region', async () => {
    mockState.pendingRewards = [makeReward()];
    const { container } = await renderPanel();
    const btn = container.querySelector('button[aria-describedby="rewards-claim-status"]');
    expect(btn).not.toBeNull();
  });

  it('spinning indicator in confirming state has aria-hidden to avoid double-reading', async () => {
    mockState.status = 'confirming';
    const { container } = await renderPanel();
    // The spinner SVG must be decorative only
    const spinSvg = container.querySelector('svg.animate-spin');
    expect(spinSvg).toHaveAttribute('aria-hidden', 'true');
  });

  it('claim button carries aria-busy=true only while confirming', async () => {
    mockState.pendingRewards = [makeReward()];
    mockState.status = 'confirming';
    const { container } = await renderPanel();
    const btn = container.querySelector('button[aria-busy="true"]');
    expect(btn).not.toBeNull();
  });

  it('claim button does NOT carry aria-busy=true in idle state', async () => {
    mockState.pendingRewards = [makeReward()];
    const { container } = await renderPanel();
    const btn = container.querySelector('button[aria-busy="true"]');
    expect(btn).toBeNull();
  });

  it('explorer links in the confirmed state have an accessible name', async () => {
    mockState.status = 'success';
    mockState.lastTxHash = TX;
    const { container } = await renderPanel();
    const links = container.querySelectorAll('a[href*="etherscan"]');
    links.forEach((link) => {
      const name =
        link.getAttribute('aria-label') ??
        link.textContent?.trim() ??
        '';
      expect(name.length).toBeGreaterThan(0);
    });
  });

  it('reward list has a labelled role=list element', async () => {
    mockState.pendingRewards = [makeReward()];
    const { container } = await renderPanel();
    const list = container.querySelector('ul[aria-label]');
    expect(list).not.toBeNull();
    expect(list?.getAttribute('aria-label')).toBeTruthy();
  });

  it('decorative star icons are aria-hidden in both panel states', async () => {
    // idle state
    const { container: idle } = await renderPanel();
    idle.querySelectorAll('svg').forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    // with rewards
    mockState.pendingRewards = [makeReward()];
    const { container: withRewards } = await renderPanel();
    withRewards.querySelectorAll('svg').forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });
});

// ---------------------------------------------------------------------------
// RewardsPage accessibility (simpler standalone page)
// ---------------------------------------------------------------------------

describe('RewardsPage — axe accessibility', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('has no violations in the unsupported (wrong chain) state', async () => {
    jest.mock('wagmi', () => ({
      useAccount: () => ({ address: '0x1111111111111111111111111111111111111111', isConnected: true }),
      useChainId: () => 1, // Ethereum mainnet — unsupported
    }));
    jest.mock('@/lib/contracts/registry', () => ({
      getContractAddress: () => '0x3333333333333333333333333333333333333333',
      getReleaseChainId: () => 11155420,
    }));
    jest.mock('@/hooks/useRewardEntitlements', () => ({
      useRewardEntitlements: () => ({
        entitlements: [],
        summary: { claimableByAsset: [], entitlements: [], hasClaimable: false },
        isLoading: false,
        isError: false,
        error: null,
        isUnsupported: true,
        unsupportedReason: 'Wrong network. Switch to the protocol chain to view claimable rewards.',
        refetch: jest.fn(),
      }),
    }));
    jest.mock('@/hooks/useRewardClaim', () => ({
      useRewardClaim: () => ({
        submitClaim: jest.fn(),
        status: 'idle',
        txHash: null,
        projection: null,
        failure: null,
        isWritePending: false,
        reset: jest.fn(),
      }),
    }));
    jest.mock('@/lib/explorer', () => ({
      getTransactionExplorerUrl: (hash: string) =>
        `https://sepolia-optimism.etherscan.io/tx/${hash}`,
    }));

    const RewardsPage = (await import('@/components/RewardsPage')).default;
    const { container } = render(<RewardsPage />);
    await assertAccessible(container);
  });

  it('has no violations in the empty (no rewards) state', async () => {
    jest.mock('wagmi', () => ({
      useAccount: () => ({ address: '0x1111111111111111111111111111111111111111', isConnected: true }),
      useChainId: () => 11155420,
    }));
    jest.mock('@/lib/contracts/registry', () => ({
      getContractAddress: () => '0x3333333333333333333333333333333333333333',
      getReleaseChainId: () => 11155420,
    }));
    jest.mock('@/hooks/useRewardEntitlements', () => ({
      useRewardEntitlements: () => ({
        entitlements: [],
        summary: { claimableByAsset: [], entitlements: [], hasClaimable: false },
        isLoading: false,
        isError: false,
        error: null,
        isUnsupported: false,
        unsupportedReason: null,
        refetch: jest.fn(),
      }),
    }));
    jest.mock('@/hooks/useRewardClaim', () => ({
      useRewardClaim: () => ({
        submitClaim: jest.fn(),
        status: 'idle',
        txHash: null,
        projection: null,
        failure: null,
        isWritePending: false,
        reset: jest.fn(),
      }),
    }));
    jest.mock('@/lib/explorer', () => ({
      getTransactionExplorerUrl: (hash: string) =>
        `https://sepolia-optimism.etherscan.io/tx/${hash}`,
    }));

    const RewardsPage = (await import('@/components/RewardsPage')).default;
    const { container } = render(<RewardsPage />);
    await assertAccessible(container);
  });
});
