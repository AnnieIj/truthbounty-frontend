'use client';

import React from 'react';
import {
  TransactionItem,
  type TransactionItemProps,
} from '@/components/transactions/transaction-item';
import { StatusCard } from '@/components/transactions/status-card';

/**
 * Deterministic, production-excluded harness that renders the transaction
 * components across every status they implement (pending / confirming /
 * confirmed / failed). Playwright drives this route to assert each state
 * renders accessibly. Fixtures are static and carry no real chain data — no
 * transaction outcome is fabricated for a real user session.
 */
const TRANSACTION_FIXTURES: TransactionItemProps[] = [
  {
    type: 'verification',
    status: 'pending',
    title: 'Verification submitted',
    description: 'Awaiting inclusion in the mempool',
    amount: '0.50 OP',
    timeAgo: 'just now',
    hash: '0xpending00000000000000000000000000000000000000000000000000000dead',
  },
  {
    type: 'stake',
    status: 'confirming',
    title: 'Stake confirming',
    description: 'Included in a block, awaiting confirmations',
    amount: '10.00 OP',
    timeAgo: '30s ago',
    progress: 40,
    hash: '0xconfirming000000000000000000000000000000000000000000000000beef',
  },
  {
    type: 'withdrawal',
    status: 'confirmed',
    title: 'Withdrawal confirmed',
    description: 'Confirmed on Optimism',
    amount: '2.00 OP',
    timeAgo: '2m ago',
    hash: '0xconfirmed0000000000000000000000000000000000000000000000000cafe',
  },
  {
    type: 'dispute',
    status: 'failed',
    title: 'Dispute reverted',
    description: 'Transaction reverted on-chain',
    amount: '1.00 OP',
    timeAgo: '5m ago',
    errorMessage: 'execution reverted: insufficient stake',
    hash: '0xfailed000000000000000000000000000000000000000000000000000f00d1',
  },
];

const STATUS_SUMMARY = [
  { status: 'pending' as const, count: 1 },
  { status: 'confirming' as const, count: 1 },
  { status: 'confirmed' as const, count: 1 },
  { status: 'failed' as const, count: 1 },
];

export function TransactionStatesHarness() {
  const [lastCopied, setLastCopied] = React.useState<string | null>(null);
  const [lastRetried, setLastRetried] = React.useState<string | null>(null);

  return (
    <main id="e2e-transaction-states" className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-white">
        Transaction states (E2E harness)
      </h1>

      <section aria-label="Status summary" className="mb-8 flex flex-wrap gap-4">
        {STATUS_SUMMARY.map(item => (
          <StatusCard key={item.status} status={item.status} count={item.count} />
        ))}
      </section>

      <section aria-label="Transactions" className="space-y-4">
        {TRANSACTION_FIXTURES.map(transaction => (
          <TransactionItem
            key={transaction.hash}
            {...transaction}
            onCopy={hash => setLastCopied(hash)}
            onRetry={
              transaction.status === 'failed'
                ? () => setLastRetried(transaction.hash)
                : undefined
            }
          />
        ))}
      </section>

      {/* Test-only affordances so Playwright can assert handler wiring. */}
      <p data-testid="last-copied" hidden>
        {lastCopied ?? ''}
      </p>
      <p data-testid="last-retried" hidden>
        {lastRetried ?? ''}
      </p>
    </main>
  );
}
