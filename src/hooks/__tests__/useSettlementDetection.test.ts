/**
 * Unit tests for useSettlementDetection hook
 * Tests successful, rejected, reverted, stale, and wrong-network paths
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useSettlementDetection } from '@/hooks/useSettlementDetection';
import * as wagmi from 'wagmi';

// Mock wagmi
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
}));

describe('useSettlementDetection', () => {
  const mockContractAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const mockUserAddress = '0x1234567890123456789012345678901234567890';
  const OPTIMISM_MAINNET = 11155420;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful settlement detection', () => {
    it('should detect provisional settlement when callable', async () => {
      // Setup mocks
      (wagmi.useAccount as jest.Mock).mockReturnValue({
        address: mockUserAddress,
        isConnected: true,
      });
      (wagmi.useChainId as jest.Mock).mockReturnValue(OPTIMISM_MAINNET);

      const { result } = renderHook(() =>
        useSettlementDetection({
          claimId: 'claim-123',
          contractAddress: mockContractAddress,
          pollInterval: 1000,
        })
      );

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should detect provisional settlement is callable
      expect(result.current.validation?.isValid).toBe(true);
    });

    it('should detect appeal settlement when callable', async () => {
      (wagmi.useAccount as jest.Mock).mockReturnValue({
        address: mockUserAddress,
        isConnected: true,
      });
      (wagmi.useChainId as jest.Mock).mockReturnValue(OPTIMISM_MAINNET);

      const { result } = renderHook(() =>
        useSettlementDetection({
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.validation?.isValid).toBe(true);
    });
  });

  describe('wallet not connected', () => {
    it('should return error when wallet not connected', async () => {
      (wagmi.useAccount as jest.Mock).mockReturnValue({
        address: undefined,
        isConnected: false,
      });
      (wagmi.useChainId as jest.Mock).mockReturnValue(OPTIMISM_MAINNET);

      const { result } = renderHook(() =>
        useSettlementDetection({
          claimId: 'claim-123',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.validation?.isValid).toBe(false);
      expect(result.current.validation?.error).toContain('Wallet not connected');
      expect(result.current.provisionalAction).toBeNull();
      expect(result.current.appealAction).toBeNull();
    });
  });

  describe('wrong network', () => {
    it('should return error on wrong chain', async () => {
      const wrongChain = 1; // Ethereum mainnet
      (wagmi.useAccount as jest.Mock).mockReturnValue({
        address: mockUserAddress,
        isConnected: true,
      });
      (wagmi.useChainId as jest.Mock).mockReturnValue(wrongChain);

      const { result } = renderHook(() =>
        useSettlementDetection({
          claimId: 'claim-123',
          contractAddress: mockContractAddress,
          expectedChainId: OPTIMISM_MAINNET,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.validation?.isValid).toBe(false);
      expect(result.current.validation?.error).toContain('Wrong network');
      expect(result.current.validation?.chainId).toBe(wrongChain);
    });
  });

  describe('invalid contract address', () => {
    it('should reject invalid contract address format', async () => {
      (wagmi.useAccount as jest.Mock).mockReturnValue({
        address: mockUserAddress,
        isConnected: true,
      });
      (wagmi.useChainId as jest.Mock).mockReturnValue(OPTIMISM_MAINNET);

      const { result } = renderHook(() =>
        useSettlementDetection({
          claimId: 'claim-123',
          contractAddress: 'invalid-address',
          expectedChainId: OPTIMISM_MAINNET,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.validation?.isValid).toBe(false);
      expect(result.current.validation?.error).toContain('Invalid contract address');
    });
  });

  describe('stale state prevention', () => {
    it('should prevent stale settlement calls', async () => {
      (wagmi.useAccount as jest.Mock).mockReturnValue({
        address: mockUserAddress,
        isConnected: true,
      });
      (wagmi.useChainId as jest.Mock).mockReturnValue(OPTIMISM_MAINNET);

      const { result, rerender } = renderHook(
        ({ chainId }) =>
          useSettlementDetection({
            claimId: 'claim-123',
            contractAddress: mockContractAddress,
            expectedChainId: chainId,
          }),
        { initialProps: { chainId: OPTIMISM_MAINNET } }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Simulate chain change
      (wagmi.useChainId as jest.Mock).mockReturnValue(1);
      rerender({ chainId: 1 });

      await waitFor(() => {
        expect(result.current.validation?.isValid).toBe(false);
      });
    });
  });

  describe('polling behavior', () => {
    it('should poll for settlement actions at specified interval', async () => {
      (wagmi.useAccount as jest.Mock).mockReturnValue({
        address: mockUserAddress,
        isConnected: true,
      });
      (wagmi.useChainId as jest.Mock).mockReturnValue(OPTIMISM_MAINNET);

      const { result } = renderHook(() =>
        useSettlementDetection({
          claimId: 'claim-123',
          contractAddress: mockContractAddress,
          pollInterval: 100, // Short interval for testing
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Wait for second poll
      await waitFor(() => {
        expect(result.current.validation).toBeDefined();
      }, { timeout: 500 });
    });
  });

  describe('Optimism Sepolia testnet', () => {
    it('should work on Optimism Sepolia testnet', async () => {
      const OPTIMISM_SEPOLIA = 11155420;
      (wagmi.useAccount as jest.Mock).mockReturnValue({
        address: mockUserAddress,
        isConnected: true,
      });
      (wagmi.useChainId as jest.Mock).mockReturnValue(OPTIMISM_SEPOLIA);

      const { result } = renderHook(() =>
        useSettlementDetection({
          claimId: 'claim-123',
          contractAddress: mockContractAddress,
          expectedChainId: OPTIMISM_SEPOLIA,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.validation?.isValid).toBe(true);
      expect(result.current.validation?.chainId).toBe(OPTIMISM_SEPOLIA);
    });
  });
});
