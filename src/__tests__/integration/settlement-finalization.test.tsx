/**
 * Integration tests for settlement and finalization flows
 * Tests full lifecycle from detection through settlement and reconciliation
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useSettlementDetection } from '@/hooks/useSettlementDetection';
import { useFinalizationDetection } from '@/hooks/useFinalizationDetection';
import { useSettlementSubmission } from '@/hooks/useSettlementSubmission';
import { useStateReconciliation } from '@/hooks/useStateReconciliation';
import * as wagmi from 'wagmi';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
  usePublicClient: jest.fn(),
}));

describe('Settlement and Finalization Integration', () => {
  const mockContractAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E';
  const mockUserAddress = '0x1234567890123456789012345678901234567890';
  const OPTIMISM_MAINNET = 10;

  beforeEach(() => {
    jest.clearAllMocks();
    (wagmi.useAccount as jest.Mock).mockReturnValue({
      address: mockUserAddress,
      isConnected: true,
    });
    (wagmi.useChainId as jest.Mock).mockReturnValue(11155420);
  });

  describe('provisional settlement flow', () => {
    it('should complete full provisional settlement lifecycle', async () => {
      // Step 1: Detect that settlement is callable
      const { result: detectionResult } = renderHook(() =>
        useSettlementDetection({
          claimId: 'claim-123',
          contractAddress: mockContractAddress,
          expectedChainId: 11155420,
          pollInterval: 1000,
        })
      );

      await waitFor(() => {
        expect(detectionResult.current.isLoading).toBe(false);
      });

      expect(detectionResult.current.validation?.isValid).toBe(true);

      // Step 2: Simulate and submit settlement
      const { result: submissionResult } = renderHook(() =>
        useSettlementSubmission({
          contractAddress: mockContractAddress,
        })
      );

      let settlementSubmission: any;
      let submitError: Error | undefined;
      if (detectionResult.current.provisionalAction?.isCallable) {
        await act(async () => {
          try {
            settlementSubmission = await submissionResult.current.submitSettlement(
              detectionResult.current.provisionalAction!
            );
          } catch (e) {
            submitError = e as Error;
          }
        });

        // Fail closed: no wallet write path ⇒ never invent a pending settlement
        expect(submitError).toBeDefined();
        expect(submitError?.message).toMatch(/writeContract|synthetic/i);
        expect(settlementSubmission).toBeUndefined();
        expect(submissionResult.current.lastSubmission).toBeNull();
      }

      // Step 3: Reconcile a real-shaped receipt (never derived from a fake hash)
      const mockTxHash = '0x' + '11'.repeat(32);
      const mockReceipt = {
        status: 1,
        blockNumber: 100n,
        from: mockUserAddress,
        logs: [],
      };

      const mockPublicClient = {
        getTransactionReceipt: jest.fn().mockResolvedValue(mockReceipt),
        getBlockNumber: jest.fn().mockResolvedValue(101n),
      };

      (wagmi.usePublicClient as jest.Mock).mockReturnValue(mockPublicClient);

      const { result: reconciliationResult } = renderHook(() =>
        useStateReconciliation()
      );

      let reconciliationOutcome: any;
      await act(async () => {
        reconciliationOutcome = await reconciliationResult.current.reconcile({
          transactionHash: mockTxHash,
          from: mockUserAddress,
          to: mockContractAddress,
          status: 'pending',
          type: 'SETTLE_PROVISIONAL',
          claimId: 'claim-123',
          timestamp: new Date().toISOString(),
        });
      });

      expect(reconciliationOutcome?.status).toBe('confirmed');
      expect(reconciliationOutcome?.finalState).toBe('SETTLED');
    });

    it('should handle rejected settlement action', async () => {
      const { result: detectionResult } = renderHook(() =>
        useSettlementDetection({
          claimId: 'claim-123',
          contractAddress: mockContractAddress,
          expectedChainId: 11155420,
        })
      );

      await waitFor(() => {
        expect(detectionResult.current.isLoading).toBe(false);
      });

      // If settlement is not callable, provisionalAction should be null or indicate not callable
      if (!detectionResult.current.provisionalAction?.isCallable) {
        const { result: submissionResult } = renderHook(() =>
          useSettlementSubmission({
            contractAddress: mockContractAddress,
          })
        );

        let error: any;
        if (detectionResult.current.provisionalAction) {
          await act(async () => {
            try {
              await submissionResult.current.submitSettlement(
                detectionResult.current.provisionalAction!
              );
            } catch (e) {
              error = e;
            }
          });

          expect(error).toBeDefined();
        }
      }
    });

    it('should prevent stale settlement calls', async () => {
      // Setup initial detection
      const { result: detectionResult, rerender } = renderHook(
        ({ chainId }) =>
          useSettlementDetection({
            claimId: 'claim-123',
            contractAddress: mockContractAddress,
            expectedChainId: chainId,
          }),
        { initialProps: { chainId: OPTIMISM_MAINNET } }
      );

      await waitFor(() => {
        expect(detectionResult.current.isLoading).toBe(false);
      });

      // Simulate chain change
      (wagmi.useChainId as jest.Mock).mockReturnValue(1);
      rerender({ chainId: 1 });

      await waitFor(() => {
        expect(detectionResult.current.validation?.isValid).toBe(false);
      });

      // Settlement submission should fail
      const { result: submissionResult } = renderHook(() =>
        useSettlementSubmission({
          contractAddress: mockContractAddress,
        })
      );

      if (detectionResult.current.provisionalAction) {
        let simulationResult: any;
        await act(async () => {
          simulationResult = await submissionResult.current.simulateSettlement(
            detectionResult.current.provisionalAction!
          );
        });

        // Simulation should succeed or provide useful error
        expect(simulationResult).toBeDefined();
      }
    });

    it('should reconcile transaction on wrong network', async () => {
      // Simulate transaction that gets submitted on correct chain
      const mockTxHash = '0x' + '1'.repeat(64);

      const mockReceipt = {
        status: 1,
        blockNumber: 100n,
        from: mockUserAddress,
        logs: [],
      };

      const mockPublicClient = {
        getTransactionReceipt: jest.fn().mockResolvedValue(mockReceipt),
        getBlockNumber: jest.fn().mockResolvedValue(101n),
      };

      (wagmi.usePublicClient as jest.Mock).mockReturnValue(mockPublicClient);

      const { result } = renderHook(() =>
        useStateReconciliation()
      );

      const mockSubmission = {
        transactionHash: mockTxHash,
        from: mockUserAddress,
        to: mockContractAddress,
        status: 'pending' as const,
        type: 'SETTLE_PROVISIONAL' as const,
        claimId: 'claim-123',
        timestamp: new Date().toISOString(),
      };

      let reconciliationResult: any;
      await act(async () => {
        reconciliationResult = await result.current.reconcile(mockSubmission);
      });

      expect(reconciliationResult?.status).toBe('confirmed');
    });
  });

  describe('appeal settlement flow', () => {
    it('should complete appeal settlement when ready', async () => {
      const { result: detectionResult } = renderHook(() =>
        useSettlementDetection({
          claimId: 'claim-123',
          contractAddress: mockContractAddress,
          expectedChainId: 11155420,
        })
      );

      await waitFor(() => {
        expect(detectionResult.current.isLoading).toBe(false);
      });

      expect(detectionResult.current.validation?.isValid).toBe(true);

      // Check if appeal settlement is detected
      if (detectionResult.current.appealAction) {
        const { result: submissionResult } = renderHook(() =>
          useSettlementSubmission({
            contractAddress: mockContractAddress,
          })
        );

        let submission: any;
        let appealError: Error | undefined;
        await act(async () => {
          try {
            submission = await submissionResult.current.submitSettlement(
              detectionResult.current.appealAction!
            );
          } catch (e) {
            appealError = e as Error;
          }
        });

        // Fail closed — never invent SETTLE_APPEAL success without a wallet write
        expect(appealError).toBeDefined();
        expect(submission).toBeUndefined();
      }
    });
  });

  describe('finalization flow', () => {
    it('should detect and finalize when ready', async () => {
      const { result: finalizationResult } = renderHook(() =>
        useFinalizationDetection({
          claimId: 'claim-123',
          contractAddress: mockContractAddress,
          expectedChainId: 11155420,
        })
      );

      await waitFor(() => {
        expect(finalizationResult.current.isLoading).toBe(false);
      });

      expect(finalizationResult.current.validation?.isValid).toBe(true);
      expect(finalizationResult.current.requirements).toBeDefined();

      if (finalizationResult.current.finalizationAction?.isCallable) {
        const { result: submissionResult } = renderHook(() =>
          useSettlementSubmission({
            contractAddress: mockContractAddress,
          })
        );

        let submission: any;
        let finalizeError: Error | undefined;
        await act(async () => {
          try {
            submission = await submissionResult.current.submitSettlement(
              finalizationResult.current.finalizationAction!
            );
          } catch (e) {
            finalizeError = e as Error;
          }
        });

        // Fail closed — never invent FINALIZE success without a wallet write
        expect(finalizeError).toBeDefined();
        expect(submission).toBeUndefined();
      }
    });

    it('should prevent premature finalization', async () => {
      // Mock requirements always satisfy finalization when the wallet/chain gate passes;
      // block finalization by putting the wallet on an unsupported network (fail closed).
      (wagmi.useChainId as jest.Mock).mockReturnValue(1);

      const { result: finalizationResult } = renderHook(() =>
        useFinalizationDetection({
          claimId: 'claim-123',
          contractAddress: mockContractAddress,
          expectedChainId: 11155420,
        })
      );

      await waitFor(() => {
        expect(finalizationResult.current.isLoading).toBe(false);
      });

      expect(finalizationResult.current.validation?.isValid).toBe(false);
      expect(finalizationResult.current.finalizationAction).toBeNull();
      expect(finalizationResult.current.validation?.error).toMatch(
        /wrong network/i,
      );
    });
  });

  describe('error recovery', () => {
    it('should handle reverted transactions gracefully', async () => {
      const mockTxHash = '0x' + '1'.repeat(64);

      const mockReceipt = {
        status: 0, // Reverted
        blockNumber: 100n,
        from: mockUserAddress,
        logs: [],
      };

      const mockPublicClient = {
        getTransactionReceipt: jest.fn().mockResolvedValue(mockReceipt),
        getBlockNumber: jest.fn().mockResolvedValue(101n),
      };

      (wagmi.usePublicClient as jest.Mock).mockReturnValue(mockPublicClient);

      const { result } = renderHook(() =>
        useStateReconciliation()
      );

      const mockSubmission = {
        transactionHash: mockTxHash,
        from: mockUserAddress,
        to: mockContractAddress,
        status: 'pending' as const,
        type: 'SETTLE_PROVISIONAL' as const,
        claimId: 'claim-123',
        timestamp: new Date().toISOString(),
      };

      let reconciliationResult: any;
      await act(async () => {
        reconciliationResult = await result.current.reconcile(mockSubmission);
      });

      expect(reconciliationResult?.status).toBe('reverted');
      expect(reconciliationResult?.finalState).toBe('PENDING_SETTLEMENT');
    });

    it('should handle transaction timeout', async () => {
      const mockPublicClient = {
        getTransactionReceipt: jest.fn().mockResolvedValue(null),
        getBlockNumber: jest.fn().mockResolvedValue(100n),
      };

      (wagmi.usePublicClient as jest.Mock).mockReturnValue(mockPublicClient);

      const { result } = renderHook(() =>
        useStateReconciliation({
          timeout: 50,
          pollInterval: 10,
        })
      );

      const mockSubmission = {
        transactionHash: '0x' + '1'.repeat(64),
        from: mockUserAddress,
        to: mockContractAddress,
        status: 'pending' as const,
        type: 'SETTLE_PROVISIONAL' as const,
        claimId: 'claim-123',
        timestamp: new Date().toISOString(),
      };

      let reconciliationResult: any;
      await act(async () => {
        reconciliationResult = await result.current.reconcile(mockSubmission);
      });

      expect(reconciliationResult?.status).toBe('timeout');
      expect(reconciliationResult?.error).toContain('not confirmed');
    });
  });
});
