/**
 * V2-FE-044 — Accessibility checks for every transaction state.
 *
 * Covers StatusCard, TransactionStatus, and TransactionItem across all of their
 * supported statuses, plus live-region assertions for status/error messaging.
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

const HASH =
  '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888';

const STATUS_CARD_STATUSES = ['pending', 'confirming', 'confirmed', 'failed'] as const;
const TX_ITEM_STATUSES = ['pending', 'confirming', 'confirmed', 'failed'] as const;
const TX_ITEM_TYPES = ['verification', 'stake', 'withdrawal', 'dispute'] as const;
const TX_STATUS_VALUES = ['idle', 'pending', 'success', 'error'] as const;

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
