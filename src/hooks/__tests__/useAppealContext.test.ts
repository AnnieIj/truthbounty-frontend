/**
 * Unit tests for useAppealContext hook
 * Tests: successful fetch, wallet not connected, wrong network, invalid address
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useAppealContext } from '../useAppealContext';
import * as wagmi from 'wagmi';

// Mock Wagmi hooks
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
  useBlockNumber: jest.fn(),
}));

describe('useAppealContext', () => {
  const mockContractAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const mockUserAddress = '0x1234567890123456789012345678901234567890';
  const OPTIMISM_MAINNET = 11155420;
  const OPTIMISM_SEPOLIA = 11155420;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default: wallet connected on correct network
    (wagmi.useAccount as jest.Mock).mockReturnValue({
      address: mockUserAddress,
      isConnected: true,
    });
    (wagmi.useChainId as jest.Mock).mockReturnValue(OPTIMISM_MAINNET);
    (wagmi.useBlockNumber as jest.Mock).mockReturnValue({
      data: BigInt(12345678),
    });
  });

  describe('successful context fetch', () => {
    it('should fetch complete appeal context when wallet connected', async () => {
      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
          pollInterval: 100000, // Long interval for testing
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.context).toBeDefined();
      expect(result.current.context?.snapshot.appealId).toBe('appeal-123');
      expect(result.current.context?.snapshot.claimId).toBe('claim-456');
      expect(result.current.context?.deadline).toBeDefined();
      expect(result.current.context?.stakeBounds).toBeDefined();
      expect(result.current.context?.walletPosition).toBeDefined();
      expect(result.current.error).toBeNull();
    });

    it('should compute eligibility correctly for eligible user', async () => {
      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(result.current.context).not.toBeNull();
      });

      expect(result.current.context?.isEligible).toBe(true);
      expect(result.current.context?.ineligibilityReason).toBeUndefined();
    });

    it('should include snapshot with first-round outcome', async () => {
      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-789',
          claimId: 'claim-101',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(result.current.context).not.toBeNull();
      });

      const snapshot = result.current.context!.snapshot;
      expect(snapshot.firstRoundDecision).toBeDefined();
      expect(snapshot.firstRoundVotesFor).toBeGreaterThanOrEqual(0);
      expect(snapshot.firstRoundVotesAgainst).toBeGreaterThanOrEqual(0);
      expect(snapshot.initiatorAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(snapshot.reason).toBeDefined();
    });

    it('should calculate deadline with time and block information', async () => {
      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(result.current.context).not.toBeNull();
      });

      const deadline = result.current.context!.deadline;
      expect(deadline.startTime).toBeDefined();
      expect(deadline.endTime).toBeDefined();
      expect(deadline.timeRemaining).toBeGreaterThanOrEqual(0);
      expect(deadline.endBlock).toBeGreaterThan(0);
      expect(deadline.currentBlock).toBeGreaterThan(0);
      expect(deadline.blocksRemaining).toBeGreaterThanOrEqual(0);
      expect(typeof deadline.isActive).toBe('boolean');
      expect(typeof deadline.hasEnded).toBe('boolean');
    });

    it('should provide stake bounds with min/max and totals', async () => {
      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(result.current.context).not.toBeNull();
      });

      const bounds = result.current.context!.stakeBounds;
      expect(bounds.minStake).toBeDefined();
      expect(BigInt(bounds.minStake)).toBeGreaterThan(BigInt(0));
      expect(bounds.totalSupportStake).toBeDefined();
      expect(bounds.totalOpposeStake).toBeDefined();
      expect(bounds.supporterCount).toBeGreaterThanOrEqual(0);
      expect(bounds.opposerCount).toBeGreaterThanOrEqual(0);
    });

    it('should check wallet position and balance', async () => {
      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(result.current.context).not.toBeNull();
      });

      const position = result.current.context!.walletPosition;
      expect(position.userAddress).toBe(mockUserAddress);
      expect(typeof position.hasParticipated).toBe('boolean');
      expect(position.currentBalance).toBeDefined();
      expect(typeof position.hasMinimumBalance).toBe('boolean');
    });
  });

  describe('wallet not connected', () => {
    it('should return error when wallet not connected', async () => {
      (wagmi.useAccount as jest.Mock).mockReturnValue({
        address: undefined,
        isConnected: false,
      });

      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
      });

      expect(result.current.error).toContain('Wallet not connected');
      expect(result.current.context).toBeNull();
    });
  });

  describe('wrong network', () => {
    it('should return error when on wrong chain', async () => {
      (wagmi.useChainId as jest.Mock).mockReturnValue(1); // Ethereum mainnet

      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
          expectedChainId: OPTIMISM_MAINNET,
        })
      );

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
      });

      expect(result.current.error).toContain('Wrong network');
      expect(result.current.error).toContain('11155420');
      expect(result.current.error).toContain('1');
      expect(result.current.context).toBeNull();
    });

    it('should work on Optimism Sepolia testnet', async () => {
      (wagmi.useChainId as jest.Mock).mockReturnValue(OPTIMISM_SEPOLIA);

      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
          expectedChainId: OPTIMISM_SEPOLIA,
        })
      );

      await waitFor(() => {
        expect(result.current.context).not.toBeNull();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.context?.snapshot).toBeDefined();
    });
  });

  describe('invalid contract address', () => {
    it('should reject invalid contract address format', async () => {
      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: 'invalid-address',
        })
      );

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
      });

      expect(result.current.error).toContain('Invalid contract address');
      expect(result.current.context).toBeNull();
    });

    it('should reject contract address without 0x prefix', async () => {
      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: '742d35Cc6634C0532925a3b844Bc9e7595f0eB1E',
        })
      );

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
      });

      expect(result.current.error).toContain('Invalid contract address');
    });
  });

  describe('ineligibility scenarios', () => {
    it('should mark user ineligible if appeal has ended', async () => {
      // Mock an expired appeal
      (wagmi.useBlockNumber as jest.Mock).mockReturnValue({
        data: BigInt(99999999), // Far future block
      });

      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-expired',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(result.current.context).not.toBeNull();
      });

      // In the mock implementation, deadline calculation will show expired
      expect(result.current.context?.deadline.hasEnded).toBe(true);
      expect(result.current.context?.isEligible).toBe(false);
      expect(result.current.context?.ineligibilityReason).toContain('ended');
    });
  });

  describe('refetch functionality', () => {
    it('should refetch context when refetch is called', async () => {
      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
          pollInterval: 100000,
        })
      );

      await waitFor(() => {
        expect(result.current.context).not.toBeNull();
      });

      const firstContext = result.current.context;

      // Call refetch
      await result.current.refetch();

      await waitFor(() => {
        expect(result.current.context).not.toBeNull();
      });

      // Should have fetched again (might be same data in mock)
      expect(result.current.context).not.toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('invalid appeal or claim ID', () => {
    it('should handle empty appeal ID', async () => {
      const { result } = renderHook(() =>
        useAppealContext({
          appealId: '',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
      });

      expect(result.current.error).toContain('Invalid appeal or claim ID');
    });

    it('should handle empty claim ID', async () => {
      const { result } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: '',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
      });

      expect(result.current.error).toContain('Invalid appeal or claim ID');
    });
  });

  describe('block number updates', () => {
    it('should update deadline when block number changes', async () => {
      const { result, rerender } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(result.current.context?.deadline).toBeDefined();
      });

      const initialBlocksRemaining = result.current.context!.deadline.blocksRemaining;

      // Simulate block advancement
      (wagmi.useBlockNumber as jest.Mock).mockReturnValue({
        data: BigInt(12345700), // Advanced by 22 blocks
      });

      rerender();

      await waitFor(() => {
        expect(result.current.context?.deadline.blocksRemaining).not.toBe(initialBlocksRemaining);
      });
    });
  });
});
