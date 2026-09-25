'use client';

import * as React from 'react';

import { Card, StatusBadge, TokenAmount } from '@/components/ui/primitives';
import { getTransactionExplorerUrl } from '@/lib/explorer';
import {
  deriveSettlementStatus,
  type SettlementStatusInput,
} from '@/lib/settlement-status';

/**
 * SettlementStatusPanel (V2-FE-117)
 *
 * Renders settlement and payout status from canonical inputs. It never invents
 * an outcome: success is shown only when the derived view-model allows it, and
 * an explorer link appears only when a real transaction hash exists.
 *
 * Accessibility contract:
 * - Labelled `region` landmark; the status badge is a polite live region so
 *   state changes are announced without stealing focus.
 * - Loading uses `aria-busy` plus a visually-hidden label.
 * - Payout amounts use tabular numerals; the explorer link has a descriptive
 *   accessible name and `rel="noopener noreferrer"`.
 */

export interface SettlementStatusPanelProps extends SettlementStatusInput {
  /** Panel heading. Defaults to "Settlement & payout". */
  title?: string;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function SettlementStatusPanel({
  title = 'Settlement & payout',
  ...input
}: SettlementStatusPanelProps) {
  const headingId = React.useId();
  const vm = deriveSettlementStatus(input);
  const isLoading = vm.phase === 'loading';

  return (
    <Card
      className="p-4 sm:p-5"
      role="region"
      aria-labelledby={headingId}
      aria-busy={isLoading || undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="tb-section text-ink">
          {title}
        </h2>
        <StatusBadge
          tone={vm.tone}
          label={vm.label}
          description={vm.description}
          live={!isLoading}
        />
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2" aria-hidden="true">
          <div className="h-3 w-2/3 animate-pulse rounded bg-divider" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-divider" />
        </div>
      ) : (
        <>
          <p className="tb-body mt-2 text-ink-secondary">{vm.headline}</p>

          {vm.payoutText ? (
            <div className="mt-3 border-t border-divider pt-3">
              <span className="tb-label uppercase tracking-wide text-ink-muted">
                Payout
              </span>
              <div className="mt-1">
                <TokenAmount amount={vm.payoutText} symbol={vm.symbol} />
              </div>
            </div>
          ) : null}

          {vm.explorerLinkable && vm.txHash ? (
            <a
              className="tb-small mt-3 inline-flex items-center gap-1 text-action underline underline-offset-4 hover:text-action-hover"
              href={getTransactionExplorerUrl(vm.txHash, vm.chainId)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View settlement transaction ${shortHash(
                vm.txHash,
              )} on block explorer (opens in a new tab)`}
            >
              View transaction
              <span aria-hidden="true">↗</span>
            </a>
          ) : null}
        </>
      )}
    </Card>
  );
}

export default SettlementStatusPanel;
