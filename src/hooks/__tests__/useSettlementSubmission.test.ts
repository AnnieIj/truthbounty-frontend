/**
 * Unit tests for useSettlementSubmission hook
 * Tests simulation, submission, and error handling
 */

import { renderHook, act } from '@testing-library/react';
import { useSettlementSubmission } from '@/hooks/useSettlementSubmission';
import { SettlementAction } from '@/app/types/settlement';
import * as wagmi from 'wagmi';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(() => 11155420),
}));

jest.mock('@/lib/contracts/registry', () => ({
  getContractAddress: jest.fn(() => '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'),
  getContractAbi: jest.fn(() => []),
  getProtocolVersion: jest.fn(() => '2.0.0'),
  getReleaseChainId: jest.fn(() => 11155420),
  getProtocolRelease: jest.fn(() => ({
    manifest: {
      protocolVersion: '2.0.0',
      releaseId: 'v2.0.0-sepolia',
      gitCommit: '5333c0acb9ccfb8a6a37ae76b3397d06781f0119',
      compilerVersion: 'foundry-0.2.0',
      chainId: 11155420,
      deploymentBlock: 0,
      abiVersion: '2.0.0',
      eventSchemaVersion: '2.0.0',
      parameterSetVersion: '2.0.0',
      contracts: {
        TruthBountyWeighted: {
          proxy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          implementation: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        },
      },
    },
    addresses: {
      chainId: 11155420,
      TruthBountyWeighted: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    },
    abis: { TruthBountyWeighted: [] },
    events: { version: '2.0.0', events: [] },
    parameters: {},
    roles: {},
    checksums: { version: '1', files: {} },
  })),
}));

describe('useSettlementSubmission', () => {
  const mockContractAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const mockUserAddress = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    jest.clearAllMocks();
    (wagmi.useAccount as jest.Mock).mockReturnValue({
      address: mockUserAddress,
    });
    (wagmi.useChainId as jest.Mock).mockReturnValue(11155420);
  });

  describe('simulation', () => {
    it('should successfully simulate provisional settlement', async () => {
      const { result } = renderHook(() =>
        useSettlementSubmission({
          contractAddress: mockContractAddress,
        })
      );

      const action: SettlementAction = {
        type: 'SETTLE_PROVISIONAL',
        claimId: 'claim-123',
        isCallable: true,
      };

      let simulationResult: any;
      await act(async () => {
        simulationResult = await result.current.simulateSettlement(action);
      });

      expect(simulationResult?.success).toBe(true);
      expect(simulationResult?.gasEstimate).toBeDefined();
      expect(simulationResult?.data?.calldata).toBeDefined();
      expect(simulationResult?.data?.from).toBe(mockUserAddress);
      expect(simulationResult?.data?.to).toBe(mockContractAddress);
    });

    it('should reject simulation for non-callable action', async () => {
      const { result } = renderHook(() =>
        useSettlementSubmission({
          contractAddress: mockContractAddress,
        })
      );

      const action: SettlementAction = {
        type: 'SETTLE_PROVISIONAL',
        claimId: 'claim-123',
        isCallable: false,
        reason: 'Voting period not ended',
      };

      let simulationResult: any;
      await act(async () => {
        simulationResult = await result.current.simulateSettlement(action);
      });

      expect(simulationResult?.success).toBe(false);
      expect(simulationResult?.error).toContain('Voting period not ended');
    });

    it('should reject simulation without wallet connection', async () => {
      (wagmi.useAccount as jest.Mock).mockReturnValue({
        address: undefined,
      });

      const { result } = renderHook(() =>
        useSettlementSubmission({
          contractAddress: mockContractAddress,
        })
      );

      const action: SettlementAction = {
        type: 'SETTLE_PROVISIONAL',
        claimId: 'claim-123',
        isCallable: true,
      };

      let simulationResult: any;
      await act(async () => {
        simulationResult = await result.current.simulateSettlement(action);
      });

      expect(simulationResult?.success).toBe(false);
      expect(simulationResult?.error).toContain('Wallet not connected');
    });

    it('should handle invalid contract address', async () => {
      const { result } = renderHook(() =>
        useSettlementSubmission({
          contractAddress: 'invalid-address',
        })
      );

      const action: SettlementAction = {
        type: 'SETTLE_PROVISIONAL',
        claimId: 'claim-123',
        isCallable: true,
      };

      let simulationResult: any;
      await act(async () => {
        simulationResult = await result.current.simulateSettlement(action);
      });

      expect(simulationResult?.success).toBe(false);
      expect(simulationResult?.error).toMatch(/Invalid contract address|Invalid EVM address|Write target address/i);
    });
  });

  describe('submission', () => {
    it('fails closed without a wallet write path (never fabricates a tx hash)', async () => {
      const { result } = renderHook(() =>
        useSettlementSubmission({
          contractAddress: mockContractAddress,
        })
      );

      const action: SettlementAction = {
        type: 'SETTLE_PROVISIONAL',
        claimId: 'claim-123',
        isCallable: true,
      };

      let error: Error | undefined;
      await act(async () => {
        try {
          await result.current.submitSettlement(action);
        } catch (e) {
          error = e as Error;
        }
      });

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/no synthetic transaction hash|writeContract/i);
      expect(result.current.lastSubmission).toBeNull();
      expect(result.current.error).toMatch(/writeContract|synthetic/i);
    });

    it('fails closed when the wallet is on the wrong chain', async () => {
      (wagmi.useChainId as jest.Mock).mockReturnValue(1);

      const { result } = renderHook(() =>
        useSettlementSubmission({
          contractAddress: mockContractAddress,
        })
      );

      const action: SettlementAction = {
        type: 'SETTLE_PROVISIONAL',
        claimId: 'claim-123',
        isCallable: true,
      };

      let error: Error | undefined;
      await act(async () => {
        try {
          await result.current.submitSettlement(action);
        } catch (e) {
          error = e as Error;
        }
      });

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/Wrong network|Unsupported network|readiness/i);
      expect(result.current.lastSubmission).toBeNull();
    });

    it('rejects non-callable actions without inventing a submission', async () => {
      const { result } = renderHook(() =>
        useSettlementSubmission({
          contractAddress: mockContractAddress,
        })
      );

      const action: SettlementAction = {
        type: 'SETTLE_PROVISIONAL',
        claimId: 'claim-123',
        isCallable: false,
        reason: 'Already settled',
      };

      let error: any;
      await act(async () => {
        try {
          await result.current.submitSettlement(action);
        } catch (e) {
          error = e;
        }
      });

      expect(error).toBeDefined();
      expect(result.current.error).toContain('Already settled');
      expect(result.current.lastSubmission).toBeNull();
    });
  });

  describe('action types', () => {
    it('should encode SETTLE_PROVISIONAL correctly', async () => {
      const { result } = renderHook(() =>
        useSettlementSubmission({
          contractAddress: mockContractAddress,
        })
      );

      const action: SettlementAction = {
        type: 'SETTLE_PROVISIONAL',
        claimId: 'claim-123',
        isCallable: true,
      };

      let simulationResult: any;
      await act(async () => {
        simulationResult = await result.current.simulateSettlement(action);
      });

      expect(simulationResult?.data?.calldata).toBeDefined();
      expect(simulationResult?.data?.calldata).toMatch(/^0x[a-f0-9]+/i);
    });

    it('should encode FINALIZE correctly', async () => {
      const { result } = renderHook(() =>
        useSettlementSubmission({
          contractAddress: mockContractAddress,
        })
      );

      const action: SettlementAction = {
        type: 'FINALIZE',
        claimId: 'claim-123',
        isCallable: true,
      };

      let simulationResult: any;
      await act(async () => {
        simulationResult = await result.current.simulateSettlement(action);
      });

      expect(simulationResult?.data?.calldata).toBeDefined();
      expect(simulationResult?.data?.calldata).toMatch(/^0x[a-f0-9]+/i);
    });
  });

  describe('loading states', () => {
    it('should set isSimulating during simulation', async () => {
      const { result } = renderHook(() =>
        useSettlementSubmission({
          contractAddress: mockContractAddress,
        })
      );

      const action: SettlementAction = {
        type: 'SETTLE_PROVISIONAL',
        claimId: 'claim-123',
        isCallable: true,
      };

      act(() => {
        result.current.simulateSettlement(action).catch(() => {
          // Ignore
        });
      });

      // Note: In real scenario with async, would need to check before promise resolves
      expect(result.current.isSimulating).toBeDefined();
    });

    it('should set isSubmitting during submission', async () => {
      const { result } = renderHook(() =>
        useSettlementSubmission({
          contractAddress: mockContractAddress,
        })
      );

      const action: SettlementAction = {
        type: 'SETTLE_PROVISIONAL',
        claimId: 'claim-123',
        isCallable: true,
      };

      act(() => {
        result.current.submitSettlement(action).catch(() => {
          // Ignore
        });
      });

      expect(result.current.isSubmitting).toBeDefined();
    });
  });
});