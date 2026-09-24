import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';


jest.mock('wagmi', () => ({
  useAccount: () => ({ address: '0xabc' }),
  useWriteContract: () => ({ data: null, writeContract: jest.fn(), isPending: false }),
  useWaitForTransactionReceipt: () => ({ isSuccess: false }),
}));

jest.mock('viem', () => ({
  createPublicClient: jest.fn(() => ({
    readContract: jest.fn().mockResolvedValue(BigInt(0)),
  })),
  http: jest.fn(),
  formatUnits: jest.fn(() => '0'),
}));

jest.mock('viem/chains', () => ({
  mainnet: {},
}));

describe('RewardsPage claim button state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue([]),
    });
  });

  it('disables claim button when no rewards are available', async () => {
    const RewardsPage = (await import('../RewardsPage')).default;
    render(<RewardsPage />);

    await waitFor(() => expect((global as any).fetch).toHaveBeenCalledWith('/api/rewards?user=0xabc'));

    expect(screen.getByRole('button', { name: /claim rewards/i })).toBeDisabled();
    expect(screen.getByText(/no rewards available/i)).toBeInTheDocument();
  });

  it('enables claim button when rewards are available', async () => {
    ((global as any).fetch as jest.Mock).mockResolvedValueOnce({
      json: jest.fn().mockResolvedValue([{ amount: 10, reason: 'Stake bonus' }]),
    });

    const RewardsPage = (await import('../RewardsPage')).default;
    render(<RewardsPage />);

    await waitFor(() => expect(screen.getByText(/stake bonus/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /claim rewards/i })).toBeEnabled();
  });
});
