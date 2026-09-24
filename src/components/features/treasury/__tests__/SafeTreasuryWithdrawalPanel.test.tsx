import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mockHook = {
  status: 'ready' as const,
  step: 'form' as const,
  draft: { recipient: '', amountWei: '', reason: '' },
  setDraft: jest.fn(),
  balance: {
    amountWei: '1000000000000000000',
    fetchedAt: new Date().toISOString(),
    isStale: false,
    chainId: 11155420,
    contractAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const,
  },
  validation: { ok: false, errors: ['Amount must be greater than zero'], warnings: [] },
  typedConfirm: '',
  setTypedConfirm: jest.fn(),
  simulation: null,
  receipt: { txHash: null, chainId: null, status: 'idle' as const, confirmations: null },
  gateBlockReason: null,
  isAdmin: true,
  refreshBalance: jest.fn(),
  goReview: jest.fn(),
  goTypedConfirm: jest.fn(),
  goBack: jest.fn(),
  simulate: jest.fn(),
  submit: jest.fn(),
  reset: jest.fn(),
};

jest.mock('@/hooks/useSafeTreasuryWithdrawal', () => ({
  useSafeTreasuryWithdrawal: () => mockHook,
}));

describe('SafeTreasuryWithdrawalPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHook.status = 'ready';
    mockHook.step = 'form';
    mockHook.gateBlockReason = null;
    mockHook.isAdmin = true;
    mockHook.receipt = { txHash: null, chainId: null, status: 'idle', confirmations: null };
  });

  it('renders accessible form and balance', async () => {
    const Panel = (await import('../SafeTreasuryWithdrawalPanel')).default;
    render(<Panel />);
    expect(screen.getByTestId('safe-treasury-withdrawal-panel')).toBeInTheDocument();
    expect(screen.getByLabelText(/recipient address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount \(wei\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('treasury-balance')).toHaveTextContent(/ETH/);
    expect(screen.getByTestId('treasury-status-banner')).toHaveAttribute('data-status', 'ready');
  });

  it('surfaces unauthorized fail-closed state', async () => {
    mockHook.status = 'unauthorized';
    mockHook.gateBlockReason = 'Connected wallet is not the canonical treasury admin — fail closed.';
    mockHook.isAdmin = false;
    const Panel = (await import('../SafeTreasuryWithdrawalPanel')).default;
    render(<Panel />);
    expect(screen.getByTestId('treasury-status-banner')).toHaveTextContent(/fail closed/i);
    expect(screen.getByLabelText(/recipient address/i)).toBeDisabled();
  });

  it('shows review step controls', async () => {
    mockHook.step = 'review';
    mockHook.status = 'review';
    mockHook.draft = {
      recipient: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      amountWei: '100',
      reason: 'ops',
    };
    mockHook.validation = { ok: true, errors: [], warnings: [] };
    const Panel = (await import('../SafeTreasuryWithdrawalPanel')).default;
    render(<Panel />);
    expect(screen.getByTestId('treasury-review')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /continue to typed confirm/i }));
    expect(mockHook.goTypedConfirm).toHaveBeenCalled();
  });

  it('never invents a tx hash in the receipt area', async () => {
    mockHook.step = 'submit';
    mockHook.status = 'pending';
    mockHook.receipt = {
      txHash: null,
      chainId: 11155420,
      status: 'pending',
      confirmations: 0,
    };
    const Panel = (await import('../SafeTreasuryWithdrawalPanel')).default;
    render(<Panel />);
    expect(screen.getByTestId('treasury-receipt')).toHaveTextContent(/nothing fabricated/i);
  });

  it('links real hashes to the explorer', async () => {
    const hash =
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as `0x${string}`;
    mockHook.step = 'submit';
    mockHook.status = 'confirmed';
    mockHook.receipt = {
      txHash: hash,
      chainId: 10,
      status: 'confirmed',
      confirmations: 3,
    };
    const Panel = (await import('../SafeTreasuryWithdrawalPanel')).default;
    render(<Panel />);
    const link = screen.getByRole('link', { name: /view treasury withdrawal on explorer/i });
    expect(link).toHaveAttribute('href', expect.stringContaining(hash));
    expect(link).toHaveAttribute('target', '_blank');
  });
});
