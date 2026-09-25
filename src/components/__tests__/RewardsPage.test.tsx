/**
 * RewardsPage — V2 data-binding update (V2-FE-060)
 *
 * The previous version fetched `/api/rewards` directly and used
 * `Number(amount)` float sums — both removed in V2-FE-060. This file tests
 * the same user-visible behaviours (button enabled/disabled, rewards list)
 * but via the canonical V2 hooks (useRewardEntitlements + useRewardClaim).
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { formatUnits } from 'viem';

// ---------------------------------------------------------------------------
// Mock the canonical V2 hooks at the boundary
// ---------------------------------------------------------------------------

const ADDR = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const TOKEN = '0x4444444444444444444444444444444444444444' as `0x${string}`;
const CLAIM_ID = `0x${'a'.repeat(64)}` as `0x${string}`;
const RELEASE_CHAIN = 11155420;

jest.mock('wagmi', () => ({
  useAccount: () => ({ address: ADDR, isConnected: true }),
  useChainId: () => RELEASE_CHAIN,
}));

jest.mock('@/lib/contracts/registry', () => ({
  getContractAddress: () => '0x3333333333333333333333333333333333333333',
  getReleaseChainId: () => RELEASE_CHAIN,
}));

jest.mock('@/lib/explorer', () => ({
  getTransactionExplorerUrl: (hash: string) =>
    `https://sepolia-optimism.etherscan.io/tx/${hash}`,
}));

// Entitlements mock — starts returning an empty list; individual tests
// override via direct mutation of entitlementsState.
let entitlementsState = {
  entitlements: [] as unknown[],
  summary: { claimableByAsset: [], entitlements: [], hasClaimable: false },
  isLoading: false,
  isError: false,
  error: null as string | null,
  isUnsupported: false,
  unsupportedReason: null as string | null,
  refetch: jest.fn(),
};

jest.mock('@/hooks/useRewardEntitlements', () => ({
  useRewardEntitlements: () => entitlementsState,
}));

const mockSubmitClaim = jest.fn();
let claimState = {
  submitClaim: mockSubmitClaim,
  status: 'idle' as string,
  txHash: null as `0x${string}` | null,
  projection: null as unknown,
  failure: null as { reason: string } | null,
  isWritePending: false,
  reset: jest.fn(),
};

jest.mock('@/hooks/useRewardClaim', () => ({
  useRewardClaim: () => claimState,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntitlement(overrides: Record<string, unknown> = {}) {
  return {
    claimId: CLAIM_ID,
    category: 'verification_reward' as const,
    amount: 1_000_000_000_000_000_000n,
    asset: TOKEN,
    decimals: 18,
    claimable: true,
    ...overrides,
  };
}

function resetStates() {
  entitlementsState = {
    entitlements: [],
    summary: { claimableByAsset: [], entitlements: [], hasClaimable: false },
    isLoading: false,
    isError: false,
    error: null,
    isUnsupported: false,
    unsupportedReason: null,
    refetch: jest.fn(),
  };
  claimState = {
    submitClaim: mockSubmitClaim,
    status: 'idle',
    txHash: null,
    projection: null,
    failure: null,
    isWritePending: false,
    reset: jest.fn(),
  };
}

async function renderPage() {
  const RewardsPage = (await import('../RewardsPage')).default;
  return render(<RewardsPage />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  resetStates();
});

describe('RewardsPage — V2 data binding', () => {
  it('disables the claim button when there are no claimable rewards', async () => {
    await renderPage();
    const btn = screen.getByRole('button', { name: /claim rewards/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText('No rewards available')).toBeInTheDocument();
  });

  it('enables the claim button when claimable entitlements exist', async () => {
    const entitlement = makeEntitlement();
    entitlementsState.entitlements = [entitlement];

    await renderPage();
    const btn = screen.getByRole('button', { name: /claim rewards/i });
    expect(btn).not.toBeDisabled();
  });

  it('renders each entitlement with its formatted amount and explanation', async () => {
    const entitlement = makeEntitlement();
    entitlementsState.entitlements = [entitlement];

    await renderPage();
    const formattedAmount = formatUnits(entitlement.amount as bigint, 18);
    expect(screen.getByText(new RegExp(formattedAmount))).toBeInTheDocument();
    expect(
      screen.getByText(
        /Paid for casting a verification that matched the finalized outcome/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows the loading state while entitlements are being fetched', async () => {
    entitlementsState.isLoading = true;
    await renderPage();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows the error state and a retry button on fetch failure', async () => {
    entitlementsState.isError = true;
    entitlementsState.error = 'Failed to load claimable rewards.';
    await renderPage();
    expect(
      screen.getByText('Failed to load claimable rewards.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows the unsupported reason on wrong chain', async () => {
    entitlementsState.isUnsupported = true;
    entitlementsState.unsupportedReason =
      'Wrong network. Switch to the protocol chain to view claimable rewards.';
    await renderPage();
    expect(
      screen.getByText(/Wrong network\. Switch to the protocol chain/i),
    ).toBeInTheDocument();
  });

  it('shows the confirmed projection with an explorer link', async () => {
    const TX = `0x${'e'.repeat(64)}` as `0x${string}`;
    claimState.projection = {
      transactionHash: TX,
      chainId: RELEASE_CHAIN,
      blockNumber: 100n,
      contractAddress: '0x3333333333333333333333333333333333333333',
      receivedAssets: [{ asset: TOKEN, amount: 1_000_000_000_000_000_000n }],
      settledClaimIds: [CLAIM_ID],
      outstandingClaimIds: [],
    };

    await renderPage();
    const link = screen.getByRole('link', { name: /view on explorer/i });
    expect(link).toHaveAttribute(
      'href',
      `https://sepolia-optimism.etherscan.io/tx/${TX}`,
    );
  });

  it('shows the claim failure reason with a dismiss button', async () => {
    claimState.failure = { reason: 'User rejected the request.' };
    await renderPage();
    expect(
      screen.getByText('User rejected the request.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /dismiss/i }),
    ).toBeInTheDocument();
  });
});
