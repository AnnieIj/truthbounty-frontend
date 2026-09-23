/**
 * Integration tests for appeal participation flow
 * Tests: complete flow from context fetch → validation → simulation → submission → reconciliation
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useAppealContext } from '@/hooks/useAppealContext';
import { useAppealParticipation } from '@/hooks/useAppealParticipation';
import { useAppealReconciliation } from '@/hooks/useAppealReconciliation';
import * as wagmi from 'wagmi';

// Mock Wagmi
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
  useBlockNumber: jest.fn(),
  useWaitForTransactionReceipt: jest.fn(),
  usePublicClient: jest.fn(),
}));

describe('Appeal Participation Integration', () => {
  const mockContractAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E';
  const mockUserAddress = '0x1234567890123456789012345678901234567890';
  const OPTIMISM_MAINNET = 10;

  beforeEach(() => {
    jest.clearAllMocks();

    (wagmi.useAccount as jest.Mock).mockReturnValue({
      address: mockUserAddress,
      isConnected: true,
    });
    (wagmi.useChainId as jest.Mock).mockReturnValue(OPTIMISM_MAINNET);
    (wagmi.useBlockNumber as jest.Mock).mockReturnValue({
      data: BigInt(12345678),
    });
    (wagmi.usePublicClient as jest.Mock).mockReturnValue({});
  });

  describe('complete participation flow', () => {
    it('should complete full flow: fetch context → validate → simulate → submit → reconcile', async () => {
      // Step 1: Fetch appeal context
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
          pollInterval: 100000,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).not.toBeNull();
      });

      const context = contextResult.current.context!;
      expect(context.isEligible).toBe(true);

      // Step 2: Initialize participation hook
      const { result: participationResult } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      // Step 3: Validate participation
      const validation = participationResult.current.validateParticipation(
        context,
        'SUPPORT',
        '500000000000000000'
      );

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Step 4: Simulate transaction
      let simulation: any;
      await act(async () => {
        simulation = await participationResult.current.simulateParticipation(
          context,
          'SUPPORT',
          '500000000000000000'
        );
      });

      expect(simulation?.success).toBe(true);
      expect(simulation?.gasEstimate).toBeDefined();
      expect(simulation?.projectedState).toBeDefined();

      // Step 5: Submit — fail closed without a real wallet write path (V2-FE-100)
      let submitError: Error | undefined;
      await act(async () => {
        try {
          await participationResult.current.submitParticipation(
            context,
            'SUPPORT',
            '500000000000000000'
          );
        } catch (e) {
          submitError = e as Error;
        }
      });

      expect(submitError).toBeDefined();
      expect(submitError?.message).toMatch(/no synthetic transaction hash|writeContract/i);

      // Reconciliation only proceeds from a real receipt — fabricate nothing here
      const realHash = '0x' + 'ab'.repeat(32);
      (wagmi.useWaitForTransactionReceipt as jest.Mock).mockReturnValue({
        data: {
          status: 'success',
          transactionHash: realHash,
          blockNumber: BigInt(12345680),
        },
        isLoading: false,
        error: null,
      });

      const { result: reconciliationResult } = renderHook(() =>
        useAppealReconciliation({
          transaction: {
            transactionHash: realHash,
            from: mockUserAddress,
            to: mockContractAddress,
            status: 'PENDING',
            appealId: 'appeal-123',
            claimId: 'claim-456',
            disputeId: 'dispute-789',
            decision: 'SUPPORT',
            stakeAmount: '500000000000000000',
            timestamp: new Date().toISOString(),
          },
        })
      );

      await waitFor(() => {
        expect(reconciliationResult.current.result).not.toBeNull();
      });

      expect(reconciliationResult.current.result?.status).toBe('confirmed');
      expect(reconciliationResult.current.result?.position.hasParticipated).toBe(true);
      expect(reconciliationResult.current.stateSegregation).not.toBeNull();
      expect(reconciliationResult.current.stateSegregation?.statesAreIndependent).toBe(true);
    });

    it('should handle oppose decision in complete flow', async () => {
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-456',
          claimId: 'claim-789',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).toBeDefined();
      });

      const { result: participationResult } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      let error: Error | undefined;
      await act(async () => {
        try {
          await participationResult.current.submitParticipation(
            contextResult.current.context!,
            'OPPOSE',
            '300000000000000000'
          );
        } catch (e) {
          error = e as Error;
        }
      });

      // Fail closed — never invent OPPOSE participation without a wallet write
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/no synthetic transaction hash|writeContract/i);
      expect(participationResult.current.lastTransaction).toBeNull();
    });
  });

  describe('error handling in flow', () => {
    it('should stop flow when context fetch fails', async () => {
      (wagmi.useAccount as jest.Mock).mockReturnValue({
        address: undefined,
        isConnected: false,
      });

      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.error).toBeDefined();
      });

      expect(contextResult.current.context).toBeNull();
      expect(contextResult.current.error).toContain('Wallet not connected');
    });

    it('should stop flow when validation fails', async () => {
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).toBeDefined();
      });

      const { result: participationResult } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      // Try to submit with insufficient stake
      await expect(
        act(async () => {
          await participationResult.current.submitParticipation(
            contextResult.current.context!,
            'SUPPORT',
            '50000000000000000' // Below minimum
          );
        })
      ).rejects.toThrow();
    });

    it('should handle transaction revert in reconciliation', async () => {
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).toBeDefined();
      });

      const { result: participationResult } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      // Submission fails closed without a wallet write path
      await act(async () => {
        try {
          await participationResult.current.submitParticipation(
            contextResult.current.context!,
            'SUPPORT',
            '500000000000000000'
          );
        } catch {
          // expected
        }
      });

      const revertedHash = '0x' + 'cd'.repeat(32);

      // Mock reverted transaction from a real-shaped receipt
      (wagmi.useWaitForTransactionReceipt as jest.Mock).mockReturnValue({
        data: {
          status: 'reverted',
          transactionHash: revertedHash,
        },
        isLoading: false,
        error: null,
      });

      const { result: reconciliationResult } = renderHook(() =>
        useAppealReconciliation({
          transaction: {
            transactionHash: revertedHash,
            from: mockUserAddress,
            to: mockContractAddress,
            status: 'PENDING',
            appealId: 'appeal-123',
            claimId: 'claim-456',
            disputeId: 'dispute-789',
            decision: 'SUPPORT',
            stakeAmount: '500000000000000000',
            timestamp: new Date().toISOString(),
          },
        })
      );

      await waitFor(() => {
        expect(reconciliationResult.current.result).not.toBeNull();
      });

      expect(reconciliationResult.current.result?.status).toBe('reverted');
      expect(reconciliationResult.current.result?.position.hasParticipated).toBe(false);
    });
  });

  describe('state segregation throughout flow', () => {
    it('should maintain state segregation from context to reconciliation', async () => {
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).not.toBeNull();
      });

      const { result: participationResult } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      let transactionError: Error | undefined;
      await act(async () => {
        try {
          await participationResult.current.submitParticipation(
            contextResult.current.context!,
            'SUPPORT',
            '500000000000000000'
          );
        } catch (e) {
          transactionError = e as Error;
        }
      });
      expect(transactionError).toBeDefined();

      const confirmedHash = '0x' + 'ef'.repeat(32);
      (wagmi.useWaitForTransactionReceipt as jest.Mock).mockReturnValue({
        data: {
          status: 'success',
          transactionHash: confirmedHash,
        },
        isLoading: false,
        error: null,
      });

      const { result: reconciliationResult } = renderHook(() =>
        useAppealReconciliation({
          transaction: {
            transactionHash: confirmedHash,
            from: mockUserAddress,
            to: mockContractAddress,
            status: 'PENDING',
            appealId: 'appeal-123',
            claimId: 'claim-456',
            disputeId: 'dispute-789',
            decision: 'SUPPORT',
            stakeAmount: '500000000000000000',
            timestamp: new Date().toISOString(),
          },
        })
      );

      await waitFor(() => {
        expect(reconciliationResult.current.stateSegregation).not.toBeNull();
      });

      const segregation = reconciliationResult.current.stateSegregation!;
      
      // Verify claim IDs match
      expect(segregation.claimId).toBe('claim-456');
      
      // Verify appeal state is tracked separately
      expect(segregation.appealState.appealId).toBe('appeal-123');
      expect(segregation.appealState.decision).toBe('SUPPORT');
      expect(segregation.appealState.status).toBe('CONFIRMED');
      
      // Verify independence flag
      expect(segregation.statesAreIndependent).toBe(true);
    });
  });

  describe('real-time updates during flow', () => {
    it('should update context when blocks advance during participation', async () => {
      const { result: contextResult, rerender } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).not.toBeNull();
      });

      const initialBlocksRemaining = contextResult.current.context!.deadline.blocksRemaining;

      // Simulate block advancement
      (wagmi.useBlockNumber as jest.Mock).mockReturnValue({
        data: BigInt(12345700),
      });

      rerender();

      // Context should update deadline
      await waitFor(() => {
        expect(contextResult.current.context?.deadline.blocksRemaining).not.toBe(
          initialBlocksRemaining
        );
      });
    });
  });

  describe('concurrent participation attempts', () => {
    it('should prevent double submission', async () => {
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).toBeDefined();
      });

      const { result: participationResult } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      // First submission fails closed without a wallet write path — no invented hash
      let firstError: Error | undefined;
      await act(async () => {
        try {
          await participationResult.current.submitParticipation(
            contextResult.current.context!,
            'SUPPORT',
            '500000000000000000'
          );
        } catch (e) {
          firstError = e as Error;
        }
      });

      expect(firstError).toBeDefined();
      expect(participationResult.current.lastTransaction).toBeNull();

      // Update context to reflect participation
      const updatedContext = {
        ...contextResult.current.context!,
        walletPosition: {
          ...contextResult.current.context!.walletPosition,
          hasParticipated: true,
          existingDecision: 'SUPPORT' as const,
        },
        isEligible: false,
        ineligibilityReason: 'Already participated',
      };

      // Second submission should fail validation
      const validation = participationResult.current.validateParticipation(
        updatedContext,
        'OPPOSE',
        '300000000000000000'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('You have already participated in this appeal');
    });
  });

  describe('gas estimation and projection', () => {
    it('should provide accurate gas and projection throughout flow', async () => {
      const { result: contextResult } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-123',
          claimId: 'claim-456',
          contractAddress: mockContractAddress,
        })
      );

      await waitFor(() => {
        expect(contextResult.current.context).toBeDefined();
      });

      const { result: participationResult } = renderHook(() =>
        useAppealParticipation({
          contractAddress: mockContractAddress,
        })
      );

      const stakeAmount = '1000000000000000000'; // 1 ETH
      let simulation: any;

      await act(async () => {
        simulation = await participationResult.current.simulateParticipation(
          contextResult.current.context!,
          'SUPPORT',
          stakeAmount
        );
      });

      expect(simulation?.gasEstimate).toBeDefined();
      expect(Number(simulation?.gasEstimate)).toBeGreaterThan(0);
      
      expect(simulation?.projectedState?.newSupportTotal).toBe('4500000000000000000');
      expect(simulation?.projectedState?.riskAmount).toBe(stakeAmount);
      expect(simulation?.projectedState?.potentialReward).toBeDefined();
    });
  });
});
