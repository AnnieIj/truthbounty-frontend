// Accessibility checks for the Stake & Treasury Withdrawal panel (V2-FE-061).
// Runs jest-axe in ready and fail-closed (unauthorized) states.

import React from 'react';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { UseStakeTreasuryWithdrawalResult } from '@/hooks/useStakeTreasuryWithdrawal';

expect.extend(toHaveNoViolations);

const CONTRACT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

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

describe('StakeTreasuryWithdrawalPanel accessibility', () => {
  afterEach(() => {
    mockHook.status = 'ready';
    mockHook.gate = {
      walletConnected: true,
      chainSupported: true,
      configComplete: true,
      abiSupportsWithdraw: true,
      isAdmin: true,
      blockReason: null,
    };
  });

  it('ready state has no axe violations', async () => {
    const Panel = (await import('@/components/features/treasury/StakeTreasuryWithdrawalPanel'))
      .default;
    const { container } = render(<Panel />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('unauthorized fail-closed state has no axe violations', async () => {
    mockHook.status = 'unauthorized';
    mockHook.gate = {
      ...mockHook.gate,
      isAdmin: false,
      blockReason: 'Connected wallet is not the canonical treasury admin — fail closed.',
    };
    const Panel = (await import('@/components/features/treasury/StakeTreasuryWithdrawalPanel'))
      .default;
    const { container } = render(<Panel />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
