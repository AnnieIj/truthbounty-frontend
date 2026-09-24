import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  TransactionItem,
  type TransactionItemProps,
} from '../transaction-item';

jest.mock('@/lib/explorer', () => ({
  openTransactionInExplorer: jest.fn(),
}));

import { openTransactionInExplorer } from '@/lib/explorer';

const baseProps: TransactionItemProps = {
  type: 'verification',
  status: 'pending',
  title: 'Verification submitted',
  description: 'Awaiting inclusion in the mempool',
  amount: '0.50 OP',
  timeAgo: 'just now',
  hash: '0xabcdef0123456789000000000000000000000000000000000000000000abcdef',
};

describe('TransactionItem', () => {
  it.each([
    ['pending', 'Pending'],
    ['confirming', 'Confirming'],
    ['confirmed', 'Confirmed'],
    ['failed', 'Failed'],
  ] as const)('renders the %s status label', (status, label) => {
    render(<TransactionItem {...baseProps} status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText('Verification submitted')).toBeInTheDocument();
  });

  it('renders confirmation progress when provided', () => {
    render(
      <TransactionItem {...baseProps} status="confirming" progress={40} />,
    );
    expect(screen.getByText('Confirmations: 40%')).toBeInTheDocument();
  });

  it('surfaces the error message and a retry control on failure', async () => {
    const onRetry = jest.fn();
    render(
      <TransactionItem
        {...baseProps}
        status="failed"
        errorMessage="execution reverted: insufficient stake"
        onRetry={onRetry}
      />,
    );

    expect(
      screen.getByText('execution reverted: insufficient stake'),
    ).toBeInTheDocument();

    const retry = screen.getByRole('button', { name: /retry/i });
    await userEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render a retry control when no handler is given', () => {
    render(<TransactionItem {...baseProps} status="failed" />);
    expect(
      screen.queryByRole('button', { name: /retry/i }),
    ).not.toBeInTheDocument();
  });

  it('copies the hash and opens the explorer via the action buttons', async () => {
    const onCopy = jest.fn();
    render(<TransactionItem {...baseProps} onCopy={onCopy} />);

    await userEvent.click(screen.getByRole('button', { name: /copy hash/i }));
    expect(onCopy).toHaveBeenCalledWith(baseProps.hash);

    await userEvent.click(
      screen.getByRole('button', { name: /view on explorer/i }),
    );
    expect(openTransactionInExplorer).toHaveBeenCalledWith(baseProps.hash);
  });
});
