/**
 * RewardsClaimFlow (V2-FE-118).
 *
 * Component contract: an accessible region that shows the claimable projection,
 * a single authorise action with an accessible disabled reason, honest busy /
 * finalized / error states, and an explorer link only with a real hash.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { assertAccessible } from '@/__tests__/utils/axe';
import { RewardsClaimFlow } from '@/components/features/rewards';
import { useRewardsClaim } from '@/hooks/useRewardsClaim';

jest.mock('@/hooks/useRewardsClaim');

const mockedHook = useRewardsClaim as jest.MockedFunction<typeof useRewardsClaim>;

const HASH = `0x${'cd'.repeat(32)}` as `0x${string}`;

function makeResult(overrides: Partial<ReturnType<typeof useRewardsClaim>> = {}) {
  return {
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E',
    rewards: [],
    totalClaimable: 0,
    status: 'idle' as const,
    eligibility: {
      canClaim: false,
      reason: 'no-rewards' as const,
      message: 'No claimable rewards yet.',
    },
    txHash: null,
    chainId: 11155420,
    confirmations: 0,
    requiredConfirmations: 4,
    errorMessage: null,
    claim: jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn(),
    ...overrides,
  };
}

describe('RewardsClaimFlow', () => {
  it('renders a labelled region', () => {
    mockedHook.mockReturnValue(makeResult());
    render(<RewardsClaimFlow />);
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /claim rewards/i })).toBeInTheDocument();
  });

  it('shows an empty message and disables the action with a reason', () => {
    mockedHook.mockReturnValue(makeResult());
    render(<RewardsClaimFlow />);
    expect(
      screen.getByText(/rewards appear here once your verified claims are settled/i),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /claim rewards/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-describedby');
  });

  it('lists rewards and enables the action when eligible', () => {
    mockedHook.mockReturnValue(
      makeResult({
        rewards: [
          { id: 'r1', amount: 1.5, reason: 'Claim settled' },
          { id: 'r2', amount: '2.25' },
        ],
        totalClaimable: 3.75,
        eligibility: { canClaim: true, reason: null, message: null },
      }),
    );
    render(<RewardsClaimFlow />);
    expect(screen.getByText('Claim settled')).toBeInTheDocument();
    expect(screen.getByText('3.75')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /claim rewards/i })).toBeEnabled();
  });

  it('invokes claim when the enabled action is clicked', () => {
    const claim = jest.fn().mockResolvedValue(undefined);
    mockedHook.mockReturnValue(
      makeResult({
        rewards: [{ id: 'r1', amount: 1 }],
        totalClaimable: 1,
        eligibility: { canClaim: true, reason: null, message: null },
        claim,
      }),
    );
    render(<RewardsClaimFlow />);
    fireEvent.click(screen.getByRole('button', { name: /claim rewards/i }));
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('shows a busy state with confirmations while claiming', () => {
    mockedHook.mockReturnValue(
      makeResult({
        status: 'confirming',
        confirmations: 2,
        rewards: [{ id: 'r1', amount: 1 }],
        totalClaimable: 1,
        eligibility: { canClaim: false, reason: 'in-progress', message: 'A claim is already in progress.' },
      }),
    );
    render(<RewardsClaimFlow />);
    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: /claiming/i })).toBeDisabled();
    expect(screen.getByText('2/4')).toBeInTheDocument();
  });

  it('shows the finalized state', () => {
    mockedHook.mockReturnValue(
      makeResult({
        status: 'finalized',
        txHash: HASH,
        eligibility: { canClaim: false, reason: null, message: null },
      }),
    );
    render(<RewardsClaimFlow />);
    expect(screen.getByRole('button', { name: /claimed/i })).toBeInTheDocument();
    expect(screen.getByText(/transaction is finalized/i)).toBeInTheDocument();
  });

  it('surfaces a safe error message as an alert', () => {
    mockedHook.mockReturnValue(
      makeResult({
        status: 'reverted',
        errorMessage: 'The claim reverted on-chain. No rewards were transferred.',
      }),
    );
    render(<RewardsClaimFlow />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/reverted on-chain/i);
  });

  it('links to the explorer only with a real hash', () => {
    mockedHook.mockReturnValue(
      makeResult({
        status: 'confirmed',
        txHash: HASH,
        eligibility: { canClaim: false, reason: 'in-progress', message: 'A claim is already in progress.' },
      }),
    );
    render(<RewardsClaimFlow />);
    const link = screen.getByRole('link', { name: /view claim transaction/i });
    expect(link).toHaveAttribute('href', `https://sepolia-optimism.etherscan.io/tx/${HASH}`);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('has no axe violations', async () => {
    mockedHook.mockReturnValue(
      makeResult({
        rewards: [{ id: 'r1', amount: 1.5, reason: 'Claim settled' }],
        totalClaimable: 1.5,
        eligibility: { canClaim: true, reason: null, message: null },
      }),
    );
    const { container } = render(<RewardsClaimFlow />);
    await assertAccessible(container);
  });
});
