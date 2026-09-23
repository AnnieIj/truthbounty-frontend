import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const VALID_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// Mutable so individual tests can flip chain without resetModules (avoids dual React).
let mockChainId = 11155420;

jest.mock('wagmi', () => ({
  useAccount: () => ({ address: VALID_ADDRESS }),
  useChainId: () => mockChainId,
  useWriteContract: () => ({
    data: null,
    writeContract: jest.fn(),
    isPending: false,
  }),
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
  optimismSepolia: {},
  mainnet: {},
}));

describe('RewardsPage claim button state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChainId = 11155420;
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue([]),
    });
  });

  it('disables claim button when no rewards are available', async () => {
    const RewardsPage = (await import('../RewardsPage')).default;
    render(<RewardsPage />);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/rewards?user=${VALID_ADDRESS}`
      )
    );

    expect(screen.getByRole('button', { name: /claim rewards/i })).toBeDisabled();
    expect(screen.getByText(/no rewards available/i)).toBeInTheDocument();
  });

  it('enables claim button when rewards are available and wallet is ready', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: jest.fn().mockResolvedValue([{ amount: 10, reason: 'Stake bonus' }]),
    });

    const RewardsPage = (await import('../RewardsPage')).default;
    render(<RewardsPage />);

    await waitFor(() => expect(screen.getByText(/stake bonus/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /claim rewards/i })).toBeEnabled();
  });

  it('disables claim when the write readiness gate fails (wrong chain)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue([{ amount: 10, reason: 'Stake bonus' }]),
    });

    mockChainId = 999999;

    const RewardsPage = (await import('../RewardsPage')).default;
    render(<RewardsPage />);

    await waitFor(() => expect(screen.getByText(/stake bonus/i)).toBeInTheDocument());
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('write-readiness-reason')).toBeInTheDocument();
  });
});
