/**
 * V2-FE-088 — Component contract tests for ClaimRewardsPanel against
 * versioned API/ABI evolution fixtures (loading / empty / success /
 * rejection / error / recovery) with accessibility assertions.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import apiV2 from '@/lib/contracts/__fixtures__/api-projections.v2.0.0.json';
import {
  asyncStateFeedback,
  claimStatusLabel,
  mapLegacyClaimStatus,
  validateApiProjection,
  type ApiProjectionFixture,
} from '@/lib/contracts/contract-evolution';

expect.extend(toHaveNoViolations);

const mockClaimAll = jest.fn();

jest.mock('@/components/skeletons', () => ({
  ClaimRewardsPanelSkeleton: () => (
    <div data-testid="claim-rewards-skeleton" role="status" aria-busy="true">
      {asyncStateFeedback('loading').message}
    </div>
  ),
}));

jest.mock('@/lib/explorer', () => ({
  getTransactionExplorerUrl: (hash: string) =>
    `https://optimistic.etherscan.io/tx/${hash}`,
}));

function mockUseRewards(overrides: Record<string, unknown>) {
  jest.doMock('@/hooks/useRewards', () => ({
    useRewards: () => ({
      pendingRewards: [],
      totalClaimable: 0,
      status: 'idle',
      lastTxHash: null,
      errorMessage: null,
      claimAll: mockClaimAll,
      ...overrides,
    }),
  }));
}

/**
 * Lightweight projection banner used only in contract tests to assert
 * enum → UI rendering and async recovery copy without redesigning production UI.
 */
function ProjectionContractBanner({
  state,
  fixture,
}: {
  state: 'loading' | 'empty' | 'success' | 'rejection' | 'error' | 'recovery';
  fixture?: ApiProjectionFixture;
}) {
  const feedback = asyncStateFeedback(state);

  if (state === 'loading') {
    return (
      <div role={feedback.role} aria-busy="true" aria-live="polite">
        {feedback.message}
      </div>
    );
  }

  if (state === 'empty') {
    return (
      <div role={feedback.role} aria-live="polite">
        {feedback.message}
      </div>
    );
  }

  if (state === 'error' || state === 'rejection') {
    return (
      <div role={feedback.role} aria-live="assertive">
        <p>{feedback.message}</p>
        <button type="button">Retry</button>
      </div>
    );
  }

  if (state === 'recovery') {
    return (
      <div role={feedback.role} aria-live="polite">
        <p>{feedback.message}</p>
        <button type="button">Reconcile</button>
      </div>
    );
  }

  const claims = fixture?.claims ?? [];
  return (
    <div role={feedback.role} aria-live="polite">
      <p>{feedback.message}</p>
      <ul>
        {claims.map((claim) => (
          <li key={claim.id}>
            <span>{claim.title}</span>
            <span aria-label={`status ${claimStatusLabel(claim.status)}`}>
              {claimStatusLabel(claim.status)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('V2-FE-088 ClaimRewardsPanel component contracts', () => {
  beforeEach(() => {
    jest.resetModules();
    mockClaimAll.mockReset();
  });

  it('loading state shows accessible busy feedback', async () => {
    mockUseRewards({ status: 'idle', totalClaimable: 0 });
    const ClaimRewardsPanel = (await import('../ClaimRewardsPanel')).default;
    const { container } = render(<ClaimRewardsPanel isLoading />);
    expect(screen.getByTestId('claim-rewards-skeleton')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading protocol/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('empty success state disables claim and exposes explorer only after tx', async () => {
    mockUseRewards({
      status: 'success',
      totalClaimable: 0,
      pendingRewards: [],
      lastTxHash: null,
    });
    const ClaimRewardsPanel = (await import('../ClaimRewardsPanel')).default;
    render(<ClaimRewardsPanel />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(screen.queryByRole('link', { name: /view on explorer/i })).toBeNull();
  });

  it('success with confirmed tx hash links to Optimism explorer (canonical receipt)', async () => {
    const txHash =
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    mockUseRewards({
      status: 'success',
      totalClaimable: 1.25,
      lastTxHash: txHash,
    });
    const ClaimRewardsPanel = (await import('../ClaimRewardsPanel')).default;
    render(<ClaimRewardsPanel />);
    const link = screen.getByRole('link', { name: /view on explorer/i });
    expect(link).toHaveAttribute(
      'href',
      `https://optimistic.etherscan.io/tx/${txHash}`,
    );
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('error / rejection states keep the claim control keyboard reachable', async () => {
    mockUseRewards({
      status: 'error',
      totalClaimable: 2,
      errorMessage: 'USER_REJECTED',
      pendingRewards: [{ id: 'r1', amount: 2 }],
    });
    const ClaimRewardsPanel = (await import('../ClaimRewardsPanel')).default;
    const user = userEvent.setup();
    render(<ClaimRewardsPanel />);
    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(mockClaimAll).toHaveBeenCalled();
  });
});

describe('V2-FE-088 projection banner against versioned fixtures', () => {
  it('renders v2 fixture claim statuses with accessible labels', async () => {
    const fixture = apiV2 as ApiProjectionFixture;
    expect(validateApiProjection(fixture)).toEqual([]);
    const { container } = render(
      <ProjectionContractBanner state="success" fixture={fixture} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/projections loaded/i);
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByLabelText('status Open')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it.each([
    ['empty'],
    ['error'],
    ['rejection'],
    ['recovery'],
  ] as const)('%s state has accurate accessible feedback and recovery control', async (state) => {
    const { container } = render(<ProjectionContractBanner state={state} />);
    const feedback = asyncStateFeedback(state);
    expect(screen.getByRole(feedback.role)).toHaveTextContent(feedback.message);
    if (state === 'error' || state === 'rejection') {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    }
    if (state === 'recovery') {
      expect(screen.getByRole('button', { name: /reconcile/i })).toBeInTheDocument();
    }
    expect(await axe(container)).toHaveNoViolations();
  });

  it('legacy fixture maps known aliases and fails closed on unknown status', () => {
    expect(mapLegacyClaimStatus('IN_REVIEW')).toBe('UNDER_REVIEW');
    expect(mapLegacyClaimStatus('QUEUED')).toBeNull();
  });
});
