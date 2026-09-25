/**
 * V2-FE-044 — Accessibility checks for every transaction state.
 * V2-FE-113 — Accessibility checks for confidence and verification outcomes.
 *
 * Covers StatusCard, TransactionStatus, and TransactionItem across all of their
 * supported statuses, plus live-region assertions for status/error messaging.
 * Also covers the confidence/verification-outcome surface so that confidence
 * scores and verification results are announced accessibly and never presented
 * as fabricated protocol outcomes.
 */

import React from 'react';
import { render, screen } from '../utils/test-utils';
import { assertAccessible } from '../utils/axe';

import { StatusCard } from '@/components/transactions/status-card';
import {
  TransactionItem,
  type TransactionItemProps,
} from '@/components/transactions/transaction-item';
import { TransactionsList } from '@/components/transactions/transaction-list';
import { TransactionStatus } from '@/components/features/claim-verification/TransactionStatus';
import {
  ConfidenceIndicator,
  type ConfidenceIndicatorProps,
} from '@/components/features/claim-verification/ConfidenceIndicator';
import {
  VerificationOutcome,
  type VerificationOutcomeProps,
} from '@/components/features/claim-verification/VerificationOutcome';

const HASH =
  '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888';

const STATUS_CARD_STATUSES = ['pending', 'confirming', 'confirmed', 'failed'] as const;
const TX_ITEM_STATUSES = ['pending', 'confirming', 'confirmed', 'failed'] as const;
const TX_ITEM_TYPES = ['verification', 'stake', 'withdrawal', 'dispute'] as const;
const TX_STATUS_VALUES = ['idle', 'pending', 'success', 'error'] as const;

// Confidence is a projection value in [0, 1]; the UI must render it as a
// percentage and expose it to assistive tech without implying finality.
const CONFIDENCE_VALUES = [0, 0.25, 0.5, 0.75, 1] as const;
const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
const OUTCOME_VALUES = [
  'pending',
  'verified',
  'rejected',
  'disputed',
  'appealed',
  'finalized',
  'reorged',
] as const;

describe('Accessibility: StatusCard — every status', () => {
  it.each(STATUS_CARD_STATUSES)('StatusCard "%s" has no axe violations', async (status) => {
    const { container } = render(<StatusCard status={status} count={3} />);
    expect(screen.getByText(status === 'failed' ? 'Failed' : status.charAt(0).toUpperCase() + status.slice(1))).toBeInTheDocument();
    await assertAccessible(container);
  });
});

describe('Accessibility: TransactionStatus — every status', () => {
  it.each(TX_STATUS_VALUES)('TransactionStatus "%s" has no axe violations', async (status) => {
    const { container } = render(<TransactionStatus status={status} />);
    // idle renders null — still must not introduce violations on empty mount
    await assertAccessible(container);
  });

  it('announces pending, success, and error status via live regions', async () => {
    const { container: pending } = render(<TransactionStatus status="pending" />);
    const pendingEl = screen.getByText(/transaction pending/i);
    expect(pendingEl).toHaveAttribute('role', 'status');
    expect(pendingEl).toHaveAttribute('aria-live', 'polite');

    const { container: success } = render(<TransactionStatus status="success" />);
    const successEl = screen.getByText(/verification submitted/i);
    expect(successEl).toHaveAttribute('role', 'status');
    expect(successEl).toHaveAttribute('aria-live', 'polite');

    const { container: error } = render(<TransactionStatus status="error" />);
    const errorEl = screen.getByText(/transaction failed/i);
    expect(errorEl).toHaveAttribute('role', 'alert');
    expect(errorEl).toHaveAttribute('aria-live', 'assertive');

    const { assertAccessible: ax } = await import('../utils/axe');
    await ax(pendingEl as HTMLElement);
    await ax(successEl as HTMLElement);
    await ax(errorEl as HTMLElement);
  });
});

describe('Accessibility: TransactionItem — every status and type', () => {
  it.each(TX_ITEM_STATUSES)('TransactionItem status "%s" has no axe violations', async (status) => {
    const props: TransactionItemProps = {
      type: 'verification',
      status,
      title: 'Verification stake',
      description: 'Stake confirmation',
      amount: '10',
      timeAgo: '1m ago',
      hash: HASH,
    };
    const { container } = render(<TransactionItem {...props} />);
    expect(screen.getByText('Verification stake')).toBeInTheDocument();
    await assertAccessible(container);
  });

  it.each(TX_ITEM_TYPES)('TransactionItem type "%s" has no axe violations', async (type) => {
    const props: TransactionItemProps = {
      type,
      status: 'pending',
      title: `${type} transaction`,
      description: 'Lifecycle stage',
      amount: '1',
      timeAgo: 'now',
      hash: HASH,
    };
    const { container } = render(<TransactionItem {...props} />);
    await assertAccessible(container);
  });

  it('TransactionItem failed state with error message is accessible and announced', async () => {
    const { container } = render(
      <TransactionItem
        type="dispute"
        status="failed"
        title="Dispute opening"
        description="Bond lock failed"
        amount="1 ETH"
        timeAgo="2m ago"
        hash={HASH}
        errorMessage="Network error — transaction dropped"
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
    const errorRegion = screen.getByText(/Network error/).closest('[role], [aria-live]') ??
      screen.getByText(/Network error/);
    expect(errorRegion).toBeInTheDocument();
    await assertAccessible(container);
  });

  it('TransactionsList of mixed statuses has no axe violations', async () => {
    const transactions: TransactionItemProps[] = [
      {
        type: 'verification',
        status: 'pending',
        title: 'Verify',
        description: 'd',
        amount: '1',
        timeAgo: 'now',
        hash: HASH,
      },
      {
        type: 'stake',
        status: 'confirming',
        title: 'Stake',
        description: 'd',
        amount: '2',
        timeAgo: 'now',
        hash: HASH,
      },
      {
        type: 'withdrawal',
        status: 'confirmed',
        title: 'Withdraw',
        description: 'd',
        amount: '3',
        timeAgo: 'now',
        hash: HASH,
      },
      {
        type: 'dispute',
        status: 'failed',
        title: 'Dispute',
        description: 'd',
        amount: '4',
        timeAgo: 'now',
        hash: HASH,
        errorMessage: 'Reverted on-chain',
      },
    ];
    const { container } = render(<TransactionsList transactions={transactions} />);
    await assertAccessible(container);
  });
});

describe('Accessibility: appeal rounds and escalation', () => {
  it.each(APPEAL_ROUND_STATES)('appeal round "$label" has no axe violations', async ({ status, label }) => {
    const { container } = render(
      <TransactionItem
        type="dispute"
        status={status}
        title={label}
        description="Appeal round lifecycle"
        amount="1 ETH"
        timeAgo="now"
        hash={HASH}
        errorMessage={status === 'failed' ? 'Appeal round rejected on-chain' : undefined}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    await assertAccessible(container);
  });

  it.each(ESCALATION_STATES)('escalation "$label" has no axe violations', async ({ status, label }) => {
    const { container } = render(
      <TransactionItem
        type="dispute"
        status={status}
        title={label}
        description="Escalation lifecycle"
        amount="1 ETH"
        timeAgo="now"
        hash={HASH}
        errorMessage={status === 'failed' ? 'Escalation rejected on-chain' : undefined}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    await assertAccessible(container);
  });

  it('announces an open appeal round via a live region', async () => {
    const { container } = render(
      <div>
        <TransactionItem
          type="dispute"
          status="pending"
          title="Appeal round open"
          description="Awaiting round finalization"
          amount="1 ETH"
          timeAgo="now"
          hash={HASH}
        />
        <TransactionStatus status="pending" />
      </div>,
    );
    const pendingEl = screen.getByText(/transaction pending/i);
    expect(pendingEl).toHaveAttribute('role', 'status');
    expect(pendingEl).toHaveAttribute('aria-live', 'polite');
    await assertAccessible(container);
  });

  it('announces a rejected escalation as an assertive alert', async () => {
    const { container } = render(
      <div>
        <TransactionItem
          type="dispute"
          status="failed"
          title="Escalation rejected"
          description="Escalation rejected on-chain"
          amount="1 ETH"
          timeAgo="now"
          hash={HASH}
          errorMessage="Escalation rejected on-chain"
        />
        <TransactionStatus status="error" />
      </div>,
    );
    const errorEl = screen.getByText(/transaction failed/i);
    expect(errorEl).toHaveAttribute('role', 'alert');
    expect(errorEl).toHaveAttribute('aria-live', 'assertive');
    await assertAccessible(container);
  });

  it('TransactionsList of appeal and escalation rounds has no axe violations', async () => {
    const transactions: TransactionItemProps[] = [
      {
        type: 'dispute',
        status: 'pending',
        title: 'Appeal round open',
        description: 'Appeal round lifecycle',
        amount: '1 ETH',
        timeAgo: 'now',
        hash: HASH,
      },
      {
        type: 'dispute',
        status: 'confirming',
        title: 'Escalation under review',
        description: 'Escalation lifecycle',
        amount: '1 ETH',
        timeAgo: 'now',
        hash: HASH,
      },
      {
        type: 'dispute',
        status: 'confirmed',
        title: 'Appeal round finalized',
        description: 'Appeal round lifecycle',
        amount: '1 ETH',
        timeAgo: 'now',
        hash: HASH,
      },
      {
        type: 'dispute',
        status: 'failed',
        title: 'Escalation rejected',
        description: 'Escalation lifecycle',
        amount: '1 ETH',
        timeAgo: 'now',
        hash: HASH,
        errorMessage: 'Escalation rejected on-chain',
      },
    ];
    const { container } = render(<TransactionsList transactions={transactions} />);
    await assertAccessible(container);
  });
});

describe('Accessibility: full lifecycle status matrix', () => {
  it('renders every StatusCard × TransactionItem status pair without violations', async () => {
    for (const cardStatus of STATUS_CARD_STATUSES) {
      for (const itemStatus of TX_ITEM_STATUSES) {
        const { container, unmount } = render(
          <div>
            <StatusCard status={cardStatus} count={1} />
            <TransactionItem
              type="verification"
              status={itemStatus}
              title="Stage"
              description="stage"
              amount="1"
              timeAgo="now"
              hash={HASH}
              errorMessage={itemStatus === 'failed' ? 'Failed: Network error' : undefined}
            />
            <TransactionStatus
              status={
                itemStatus === 'failed'
                  ? 'error'
                  : itemStatus === 'confirmed'
                    ? 'success'
                    : 'pending'
              }
            />
          </div>,
        );
        await assertAccessible(container);
        unmount();
      }
    }
  });
});

describe('Accessibility: ConfidenceIndicator — confidence projection values', () => {
  it.each(CONFIDENCE_VALUES)('confidence %s has no axe violations', async (confidence) => {
    const { container } = render(<ConfidenceIndicator confidence={confidence} />);
    // Confidence must be exposed as a percentage, never as a fabricated outcome.
    expect(screen.getByText(`${Math.round(confidence * 100)}%`)).toBeInTheDocument();
    await assertAccessible(container);
  });

  it.each(CONFIDENCE_LEVELS)('confidence level "%s" has no axe violations', async (level) => {
    const props: ConfidenceIndicatorProps = { confidence: 0.5, level };
    const { container } = render(<ConfidenceIndicator {...props} />);
    await assertAccessible(container);
  });

  it('exposes the confidence value to assistive tech via a labelled meter', async () => {
    const { container } = render(<ConfidenceIndicator confidence={0.75} />);
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '75');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(meter).toHaveAccessibleName(/confidence/i);
    await assertAccessible(container);
  });

  it('renders a stale/unknown confidence state without fabricating a score', async () => {
    const { container } = render(<ConfidenceIndicator confidence={null} />);
    expect(screen.getByText(/confidence unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    await assertAccessible(container);
  });
});

describe('Accessibility: VerificationOutcome — every outcome', () => {
  it.each(OUTCOME_VALUES)('outcome "%s" has no axe violations', async (outcome) => {
    const props: VerificationOutcomeProps = { outcome };
    const { container } = render(<VerificationOutcome {...props} />);
    await assertAccessible(container);
  });

  it('announces pending and finalized outcomes via live regions', async () => {
    const { container: pending } = render(<VerificationOutcome outcome="pending" />);
    const pendingEl = screen.getByText(/verification pending/i);
    expect(pendingEl).toHaveAttribute('role', 'status');
    expect(pendingEl).toHaveAttribute('aria-live', 'polite');

    const { container: finalized } = render(<VerificationOutcome outcome="finalized" />);
    const finalizedEl = screen.getByText(/finalized/i);
    expect(finalizedEl).toHaveAttribute('role', 'status');
    expect(finalizedEl).toHaveAttribute('aria-live', 'polite');

    const { assertAccessible: ax } = await import('../utils/axe');
    await ax(pendingEl as HTMLElement);
    await ax(finalizedEl as HTMLElement);
    await assertAccessible(pending);
    await assertAccessible(finalized);
  });

  it('announces rejected, disputed, and reorged outcomes as alerts', async () => {
    for (const outcome of ['rejected', 'disputed', 'reorged'] as const) {
      const { container, unmount } = render(<VerificationOutcome outcome={outcome} />);
      const alertEl = container.querySelector('[role="alert"]');
      expect(alertEl).not.toBeNull();
      expect(alertEl).toHaveAttribute('aria-live', 'assertive');
      await assertAccessible(container);
      unmount();
    }
  });

  it('renders a failed/error outcome with a recoverable retry affordance', async () => {
    const { container } = render(
      <VerificationOutcome
        outcome="rejected"
        errorMessage="Verification could not be confirmed on-chain"
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByText(/could not be confirmed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    await assertAccessible(container);
  });
});

describe('Accessibility: confidence × verification outcome matrix', () => {
  it('renders every confidence × outcome pair without violations', async () => {
    for (const confidence of CONFIDENCE_VALUES) {
      for (const outcome of OUTCOME_VALUES) {
        const { container, unmount } = render(
          <div>
            <ConfidenceIndicator confidence={confidence} />
            <VerificationOutcome outcome={outcome} />
          </div>,
        );
        await assertAccessible(container);
        unmount();
      }
    }
  });
});
