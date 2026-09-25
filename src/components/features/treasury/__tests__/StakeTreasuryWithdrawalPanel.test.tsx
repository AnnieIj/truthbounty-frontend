import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import type { UseStakeTreasuryWithdrawalResult } from '@/hooks/useStakeTreasuryWithdrawal';

const CONTRACT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
const HASH = (`0x${'ab'.repeat(32)}`) as `0x${string}`;

const mockHook: UseStakeTreasuryWithdrawalResult = {
  status: 'ready',
  gate: {
    walletConnected: true,
    chainSupported: true,
    configComplete: true,
    abiSupportsWithdraw: true,
    isAdmin: true,
    blockReason: null,
  },
  balance: {
    reservedWei: '1000000000000000000',
    unlockedWei: '5000000000000000000',
    minBondWei: '1000000000000000000',
    fetchedAt: new Date().toISOString(),
    isStale: false,
    chainId: 11155420,
    contractAddress: CONTRACT,
  },
  loadingBalance: false,
  recipients: [{ id: 'r1', recipient: '', amountWei: '', asset: 'native' }],
  validation: { ok: false, errors: [], rowErrors: {}, warnings: [] },
  outcomes: [],
  summary: {
    total: 0,
    confirmed: 0,
    failed: 0,
    rejected: 0,
    pending: 0,
    allSettled: true,
    anyIndeterminate: false,
    partial: false,
  },
  refreshBalance: jest.fn(),
  addRecipient: jest.fn(),
  updateRecipient: jest.fn(),
  removeRecipient: jest.fn(),
  submit: jest.fn(),
  reset: jest.fn(),
};

jest.mock('@/hooks/useStakeTreasuryWithdrawal', () => ({
  useStakeTreasuryWithdrawal: () => mockHook,
}));

function resetHook() {
  mockHook.status = 'ready';
  mockHook.gate = {
    walletConnected: true,
    chainSupported: true,
    configComplete: true,
    abiSupportsWithdraw: true,
    isAdmin: true,
    blockReason: null,
  };
  mockHook.recipients = [{ id: 'r1', recipient: '', amountWei: '', asset: 'native' }];
  mockHook.validation = { ok: false, errors: [], rowErrors: {}, warnings: [] };
  mockHook.outcomes = [];
  mockHook.summary = {
    total: 0,
    confirmed: 0,
    failed: 0,
    rejected: 0,
    pending: 0,
    allSettled: true,
    anyIndeterminate: false,
    partial: false,
  };
}

describe('StakeTreasuryWithdrawalPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHook();
  });

  it('renders reserved vs unlocked balances and recipient controls', async () => {
    const Panel = (await import('../StakeTreasuryWithdrawalPanel')).default;
    render(<Panel />);

    expect(screen.getByTestId('stake-treasury-withdrawal-panel')).toBeInTheDocument();
    expect(screen.getByTestId('stake-reserved-balance')).toHaveTextContent(/1/);
    expect(screen.getByTestId('treasury-unlocked-balance')).toHaveTextContent(/5/);
    expect(screen.getByLabelText(/recipient 1 address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount \(wei\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('stake-treasury-status-banner')).toHaveAttribute(
      'data-status',
      'ready',
    );
  });

  it('adds a recipient row via the accessible button', async () => {
    const Panel = (await import('../StakeTreasuryWithdrawalPanel')).default;
    render(<Panel />);
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }));
    expect(mockHook.addRecipient).toHaveBeenCalled();
  });

  it('disables submission and inputs when unauthorized (fail closed)', async () => {
    mockHook.status = 'unauthorized';
    mockHook.gate = {
      ...mockHook.gate,
      isAdmin: false,
      blockReason: 'Connected wallet is not the canonical treasury admin — fail closed.',
    };
    const Panel = (await import('../StakeTreasuryWithdrawalPanel')).default;
    render(<Panel />);

    expect(screen.getByTestId('stake-treasury-status-banner')).toHaveTextContent(/fail closed/i);
    expect(screen.getByLabelText(/recipient 1 address/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /submit withdrawals/i })).toBeDisabled();
    expect(screen.getByTestId('stake-treasury-readonly-note')).toBeInTheDocument();
  });

  it('shows per-recipient outcomes and never fabricates a hash', async () => {
    mockHook.status = 'partial';
    mockHook.summary = {
      total: 2,
      confirmed: 1,
      failed: 0,
      rejected: 1,
      pending: 0,
      allSettled: true,
      anyIndeterminate: false,
      partial: true,
    };
    mockHook.outcomes = [
      {
        id: 'a',
        recipient: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        amountWei: '1000',
        status: 'confirmed',
        txHash: HASH,
        chainId: 11155420,
        confirmations: 3,
      },
      {
        id: 'b',
        recipient: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
        amountWei: '2000',
        status: 'rejected',
        txHash: null,
        chainId: 11155420,
        confirmations: null,
        error: 'You rejected the transaction in your wallet.',
      },
    ];

    const Panel = (await import('../StakeTreasuryWithdrawalPanel')).default;
    render(<Panel />);

    expect(screen.getByTestId('stake-treasury-summary')).toHaveTextContent(/1 confirmed/);
    expect(screen.getByTestId('stake-treasury-summary')).toHaveTextContent(/1 rejected/);

    const link = screen.getByRole('link', {
      name: /view withdrawal for 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC on explorer/i,
    });
    expect(link).toHaveAttribute('href', expect.stringContaining(HASH));
    expect(link).toHaveAttribute('target', '_blank');

    expect(screen.getByText(/nothing fabricated/i)).toBeInTheDocument();
  });
});
