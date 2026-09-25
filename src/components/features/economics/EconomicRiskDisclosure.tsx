'use client';

import * as React from 'react';

import { Card, StatusBadge, TokenAmount } from '@/components/ui/primitives';
import {
  bpsToPercent,
  formatDurationSeconds,
  formatTokenAmount,
  getAllowanceStatus,
  getBondAffordability,
  getCanonicalEconomicParameters,
} from '@/lib/economics';

/**
 * EconomicRiskDisclosure (V2-FE-116)
 *
 * Discloses the bond at risk, protocol fee, appeal window and ERC-20 allowance
 * state before a user authorises a protocol action (verify, dispute, appeal,
 * settle). All figures come from canonical protocol parameters or from real
 * wallet/allowance reads supplied by the caller — nothing is estimated or
 * invented. When canonical parameters cannot be verified the panel fails
 * closed and shows no amounts.
 *
 * Accessibility contract:
 * - Exposed as a labelled `region` landmark (`aria-labelledby` -> heading).
 * - Values use a definition list; amounts render with tabular numerals.
 * - Allowance/balance states pair a text label with an icon (never colour
 *   alone) via the StatusBadge primitive.
 */

export interface EconomicRiskDisclosureProps {
  /** Action the user is about to authorise, e.g. "Verify", "Dispute", "Appeal". */
  action: string;
  /** Bond required for this action. Defaults to the canonical minimum bond. */
  bondWei?: bigint;
  /** Token decimals for the bond. Defaults to 18. */
  decimals?: number;
  /** Bond token symbol. Defaults to "TBNT". */
  symbol?: string;
  /** Current on-chain ERC-20 allowance for the spender, if known. */
  allowanceWei?: bigint | null;
  /** Allowance required to submit without a separate approval. Defaults to the bond. */
  requiredAllowanceWei?: bigint;
  /** Current spendable token balance, if known. */
  balanceWei?: bigint | null;
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-divider pt-3 first:border-t-0 first:pt-0">
      <dt className="tb-label uppercase tracking-wide text-ink-muted">{term}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

export function EconomicRiskDisclosure({
  action,
  bondWei,
  decimals = 18,
  symbol = 'TBNT',
  allowanceWei = null,
  requiredAllowanceWei,
  balanceWei = null,
}: EconomicRiskDisclosureProps) {
  const headingId = React.useId();
  const params = React.useMemo(() => getCanonicalEconomicParameters(), []);

  // Fail closed: without verified canonical parameters we must not disclose
  // (or imply) any bond, fee or allowance.
  if (!params) {
    return (
      <Card className="p-4 sm:p-5" role="region" aria-labelledby={headingId}>
        <h2 id={headingId} className="tb-section text-ink">
          Economic risk
        </h2>
        <div className="mt-3">
          <StatusBadge tone="danger" label="Economics unavailable" />
          <p className="tb-small mt-2 text-ink-secondary" role="alert">
            Protocol parameters could not be verified. No bond, fee or allowance
            is shown, and the {action.toLowerCase()} action should not be signed
            until configuration is restored.
          </p>
        </div>
      </Card>
    );
  }

  const bond = bondWei ?? params.minBondWei;
  const requiredAllowance = requiredAllowanceWei ?? bond;
  const bondText = formatTokenAmount(bond, decimals);
  const allowanceStatus = getAllowanceStatus(allowanceWei, requiredAllowance);
  const affordability = getBondAffordability(balanceWei, bond);

  return (
    <Card className="p-4 sm:p-5" role="region" aria-labelledby={headingId}>
      <h2 id={headingId} className="tb-section text-ink">
        Bonds, allowances &amp; economic risk
      </h2>
      <p className="tb-small mt-1 text-ink-secondary">
        Review before signing your{' '}
        <span className="font-semibold text-ink">{action}</span>. Contracts are
        authoritative; the figures below come from protocol parameters and your
        wallet, not from an estimate.
      </p>

      <dl className="mt-4 grid gap-3">
        <Row term={`Bond (${symbol})`}>
          <div className="flex flex-wrap items-center gap-2">
            <TokenAmount amount={bondText} symbol={symbol} />
            {affordability === 'insufficient' ? (
              <StatusBadge tone="danger" label="Insufficient balance" />
            ) : null}
          </div>
          <p className="tb-small mt-1 text-ink-muted">
            Staked on submission and at risk: an unsuccessful{' '}
            {action.toLowerCase()} can be partially or fully slashed.
          </p>
        </Row>

        <Row term="Protocol fee">
          <TokenAmount amount={bpsToPercent(params.protocolFeeBps)} />
          <p className="tb-small mt-1 text-ink-muted">
            Deducted by the protocol from settlement rewards.
          </p>
        </Row>

        <Row term="Appeal window">
          <span className="tb-data font-semibold text-ink">
            {formatDurationSeconds(params.appealWindowSeconds)}
          </span>
          <p className="tb-small mt-1 text-ink-muted">
            Outcomes can be appealed for this period before they become final.
          </p>
        </Row>

        <Row term="Token allowance">
          {allowanceStatus === 'insufficient' ? (
            <>
              <StatusBadge tone="warning" label="Approval required" />
              <p className="tb-small mt-1 text-ink-muted">
                Approving the contract to move your {symbol} is a separate
                transaction you must confirm and pay gas for before the{' '}
                {action.toLowerCase()} can be submitted.
              </p>
            </>
          ) : allowanceStatus === 'unknown' ? (
            <>
              <StatusBadge tone="neutral" label="Not verified yet" />
              <p className="tb-small mt-1 text-ink-muted">
                Your allowance is checked on-chain before signing. No approval is
                assumed.
              </p>
            </>
          ) : (
            <>
              <StatusBadge tone="success" label="Allowance set" />
              <p className="tb-small mt-1 text-ink-muted">
                The contract can move the required {symbol} for this action.
              </p>
            </>
          )}
        </Row>
      </dl>
    </Card>
  );
}

export default EconomicRiskDisclosure;
