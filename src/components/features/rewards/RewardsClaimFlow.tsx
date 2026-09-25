'use client';

import * as React from 'react';

import { Card, StatusBadge, TokenAmount } from '@/components/ui/primitives';
import { useRewardsClaim } from '@/hooks/useRewardsClaim';
import { getTransactionExplorerUrl } from '@/lib/explorer';
import { claimStatusBadge } from '@/lib/rewards-claim';
import { cn } from '@/lib/utils';

/**
 * RewardsClaimFlow (V2-FE-118)
 *
 * Accessible rewards claim journey: shows the claimable projection, a single
 * authorise action, and honest transaction state (approval, signature,
 * submitted, confirming, confirmed, finalized, rejected, reverted). It never
 * presents success without a canonical receipt + finality, and every disabled
 * action carries an accessible explanation.
 *
 * Accessibility contract:
 * - Labelled `region` landmark; status badge is a polite live region.
 * - The claim button is a real `<button>`; when disabled, `aria-describedby`
 *   points at a visible reason.
 * - Loading/busy states set `aria-busy`; the explorer link only renders with a
 *   real transaction hash and uses `rel="noopener noreferrer"`.
 */

export interface RewardsClaimFlowProps {
  /** Display symbol for reward amounts. Defaults to "TBNT". */
  symbol?: string;
}

function formatRewardAmount(amount: number | string): string {
  const value = Number(amount);
  return Number.isFinite(value) ? value.toFixed(2) : String(amount);
}

export function RewardsClaimFlow({ symbol = 'TBNT' }: RewardsClaimFlowProps) {
  const headingId = React.useId();
  const reasonId = React.useId();

  const {
    rewards,
    totalClaimable,
    status,
    eligibility,
    txHash,
    chainId,
    confirmations,
    requiredConfirmations,
    errorMessage,
    claim,
  } = useRewardsClaim();

  const badge = claimStatusBadge(status);
  const isLoading = status === 'loading';
  const busy =
    status === 'awaitingSignature' ||
    status === 'submitted' ||
    status === 'confirming';
  const disabled = !eligibility.canClaim || busy;
  const isErrorState =
    status === 'error' || status === 'reverted' || status === 'rejected';

  const reason =
    errorMessage ??
    (status === 'finalized'
      ? 'Rewards claimed. The transaction is finalized on-chain.'
      : eligibility.message);

  return (
    <Card
      className="p-4 sm:p-5"
      role="region"
      aria-labelledby={headingId}
      aria-busy={isLoading || busy || undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={headingId} className="tb-section text-ink">
            Claim rewards
          </h2>
          <p className="tb-small mt-1 text-ink-secondary">
            Rewards earned from settled verification.
          </p>
        </div>
        <StatusBadge tone={badge.tone} label={badge.label} live />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-divider pt-3">
        <span className="tb-label uppercase tracking-wide text-ink-muted">
          Total claimable
        </span>
        <TokenAmount
          amount={totalClaimable.toFixed(2)}
          symbol={symbol}
          className="text-lg"
        />
      </div>

      {isLoading ? (
        <div className="mt-3 space-y-2" aria-hidden="true">
          <div className="h-3 w-full animate-pulse rounded bg-divider" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-divider" />
        </div>
      ) : rewards.length === 0 ? (
        <p className="tb-small mt-3 text-ink-muted">
          No claimable rewards yet. Rewards appear here once your verified
          claims are settled.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-divider">
          {rewards.map((reward) => (
            <li
              key={reward.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="tb-small truncate text-ink-secondary">
                {reward.reason ?? `Reward ${reward.id}`}
              </span>
              <TokenAmount
                amount={formatRewardAmount(reward.amount)}
                symbol={symbol}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void claim()}
          disabled={disabled}
          aria-describedby={reason ? reasonId : undefined}
          className={cn(
            'tb-touch inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
            'bg-action text-action-ink hover:bg-action-hover',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            'disabled:cursor-not-allowed disabled:bg-disabled disabled:text-ink-muted disabled:hover:bg-disabled',
          )}
        >
          {busy ? 'Claiming…' : status === 'finalized' ? 'Claimed' : 'Claim rewards'}
        </button>

        {reason ? (
          <p
            id={reasonId}
            className="tb-small text-ink-muted"
            role={isErrorState ? 'alert' : undefined}
          >
            {reason}
          </p>
        ) : null}

        {busy && requiredConfirmations > 0 ? (
          <p className="tb-small text-ink-muted">
            Confirmations:{' '}
            <span className="tb-data">
              {confirmations}/{requiredConfirmations}
            </span>
          </p>
        ) : null}

        {txHash ? (
          <a
            className="tb-small inline-flex items-center gap-1 text-action underline underline-offset-4 hover:text-action-hover"
            href={getTransactionExplorerUrl(txHash, chainId)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View claim transaction on block explorer (opens in a new tab)"
          >
            View transaction
            <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </div>
    </Card>
  );
}

export default RewardsClaimFlow;
