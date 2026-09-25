/**
 * ClaimRewardsPanel — legacy smoke test (V2 data-binding update, V2-FE-060)
 *
 * The previous version used a non-bytes32 fabricated `mockTxHash` string and
 * referenced a `totalClaimable` numeric field that no longer exists on the
 * V2 hook return type.
 *
 * This file is kept minimal: it verifies that the component mounts and
 * renders the "View on Explorer" link in the success state with the correct
 * V2-shaped canonical `lastTxHash`. Full state and a11y coverage lives in:
 *   - src/__tests__/components/ClaimRewardsPanel.test.tsx
 *   - src/components/features/__tests__/ClaimRewardsPanel.v2.test.tsx
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// A canonical 64-hex bytes32 hash (matches the real wagmi return shape).
const TX_HASH = `0x${'e'.repeat(64)}` as `0x${string}`;

jest.mock('@/hooks/useRewards', () => ({
  useRewards: () => ({
    pendingRewards: [],
    totalClaimableDisplay: null,
    status: 'success' as const,
    lastTxHash: TX_HASH,
    errorMessage: null,
    isUnsupported: false,
    unsupportedReason: null,
    claimAll: jest.fn(),
    reset: jest.fn(),
  }),
}));

jest.mock('@/components/skeletons', () => ({
  ClaimRewardsPanelSkeleton: () => <div data-testid="skeleton" />,
}));

jest.mock('@/lib/explorer', () => ({
  getTransactionExplorerUrl: (hash: string) =>
    `https://sepolia-optimism.etherscan.io/tx/${hash}`,
}));

describe('ClaimRewardsPanel — View on Explorer link (V2 shape)', () => {
  it('renders "View on Explorer" link when the transaction is confirmed', async () => {
    const ClaimRewardsPanel = (await import('../ClaimRewardsPanel')).default;
    render(<ClaimRewardsPanel />);

    const link = screen.getByRole('link', { name: /view on explorer/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      'href',
      `https://sepolia-optimism.etherscan.io/tx/${TX_HASH}`,
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
