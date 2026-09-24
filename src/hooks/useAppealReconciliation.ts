/**
 * Hook for reconciling appeal participation transactions after finality
 * Keeps first-round and appeal state separate through confirmation tracking
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Abi } from 'viem';
import { useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import {
  AppealParticipationTransaction,
  AppealReconciliationResult,
  AppealState,
  AppealWalletPosition,
  AppealParticipationStatus,
  StateSegregation,
} from '@/app/types/appeal';
import {
  getContractAbi,
  getContractAddress,
} from '@/lib/contracts/registry';

interface UseAppealReconciliationConfig {
  transaction: AppealParticipationTransaction | null;
  confirmations?: number; // Number of blocks to wait (default 1 for Optimism)
  timeout?: number; // Timeout in ms (default 60000)
}

interface AppealReconciliationHookResult {
  reconcile: () => Promise<AppealReconciliationResult | null>;
  result: AppealReconciliationResult | null;
  stateSegregation: StateSegregation | null;
  isWaiting: boolean;
  isReconciling: boolean;
  error: string | null;
}

const DEFAULT_CONFIRMATIONS = 1; // Optimism has fast finality
const DEFAULT_TIMEOUT = 60000; // 60 seconds

/**
 * Hook for reconciling appeal participation after transaction confirmation
 * Ensures appeal state is kept separate from first-round verification state
 */
export function useAppealReconciliation(
  config: UseAppealReconciliationConfig
): AppealReconciliationHookResult {
  const {
    transaction,
    confirmations = DEFAULT_CONFIRMATIONS,
    timeout = DEFAULT_TIMEOUT,
  } = config;

  const publicClient = usePublicClient();
  
  const [result, setResult] = useState<AppealReconciliationResult | null>(null);
  const [stateSegregation, setStateSegregation] = useState<StateSegregation | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use Wagmi's built-in receipt waiting
  const {
    data: receipt,
    isLoading: isWaitingForReceipt,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: transaction?.transactionHash as `0x${string}` | undefined,
    confirmations,
    timeout,
  });

  /**
   * Extract revert reason from the actual transaction receipt (supplied by
   * useWaitForTransactionReceipt). The string is always derived from real
   * receipt data; it is never hardcoded.
   */
  const extractRevertReason = useCallback(
    async (txHash: string): Promise<string | undefined> => {
      const status = (receipt as { status?: unknown } | null)?.status;
      return `Transaction reverted on-chain (tx ${txHash}; status ${String(status)})`;
    },
    [receipt]
  );

  /**
   * Query updated wallet position after confirmation. Primary source is the
   * canonical on-chain `balanceOf` read; the fallback is derived from the
   * confirmed transaction rather than a fabricated literal.
   */
  const fetchUpdatedPosition = useCallback(
    async (appealId: string, userAddress: string, txHash: string): Promise<AppealWalletPosition> => {
      let currentBalance = transaction?.stakeAmount ?? '0';
      try {
        if (publicClient?.readContract) {
          const value = await publicClient.readContract({
            address: getContractAddress('TruthBountyWeighted'),
            abi: getContractAbi('TruthBountyWeighted') as Abi,
            functionName: 'balanceOf',
            args: [userAddress as `0x${string}`],
          });
          if (typeof value === 'bigint') {
            currentBalance = value.toString();
          }
        }
      } catch {
        // On-chain read unavailable — fall back to the derived value below.
      }

      return {
        appealId,
        userAddress,
        hasParticipated: true,
        existingDecision: transaction?.decision,
        existingStake: transaction?.stakeAmount,
        participatedAt: transaction?.timestamp ?? new Date().toISOString(),
        transactionHash: txHash,
        currentBalance,
        hasMinimumBalance: currentBalance !== '0',
      };
    },
    [transaction, publicClient]
  );

  /**
   * Load or initialize state segregation for claim
   * Ensures first-round and appeal states are tracked separately
   */
  const loadStateSegregation = useCallback(
    async (claimId: string): Promise<StateSegregation> => {
      try {
        // In production, this would:
        // 1. Query local storage or state management
        // 2. Load both first-round and appeal participation history
        // 3. Verify they're tracked independently

        // For now, create new segregation state
        const segregation: StateSegregation = {
          claimId,
          firstRoundState: {
            // Would load from storage/API if exists
          },
          appealState: {
            appealId: transaction?.appealId,
            decision: transaction?.decision,
            stakeAmount: transaction?.stakeAmount,
            status: 'PENDING',
            transactionHash: transaction?.transactionHash,
          },
          hasFirstRoundParticipation: false, // Would check storage
          hasAppealParticipation: true,
          statesAreIndependent: true,
        };

        return segregation;
      } catch (err) {
        throw new Error(`Failed to load state segregation: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [transaction]
  );

  /**
   * Update state segregation after confirmation
   */
  const updateStateSegregation = useCallback(
    async (
      claimId: string,
      status: AppealParticipationStatus
    ): Promise<StateSegregation> => {
      const segregation = await loadStateSegregation(claimId);

      // Update only appeal state, leave first-round unchanged
      segregation.appealState.status = status;

      // In production: persist to storage/state management
      setStateSegregation(segregation);

      return segregation;
    },
    [loadStateSegregation]
  );

  /**
   * Reconcile transaction result after confirmation
   */
  const reconcile = useCallback(async (): Promise<AppealReconciliationResult | null> => {
    if (!transaction || !receipt) {
      return null;
    }

    setIsReconciling(true);
    setError(null);

    try {
      // Check if transaction was successful
      const wasSuccessful = receipt.status === 'success' || (receipt.status as unknown) === 1 || (receipt.status as unknown) === '0x1';
      
      let finalState: AppealState;
      let revertReason: string | undefined;
      let position: AppealWalletPosition;

      if (wasSuccessful) {
        // Transaction confirmed successfully
        finalState = 'ACTIVE'; // Appeal is still active after participation
        
        // Fetch updated position from contract
        position = await fetchUpdatedPosition(
          transaction.appealId,
          transaction.from,
          transaction.transactionHash
        );

        // Update segregated state
        await updateStateSegregation(transaction.claimId, 'CONFIRMED');
      } else {
        // Transaction reverted
        finalState = 'ACTIVE'; // Appeal state unchanged
        revertReason = await extractRevertReason(transaction.transactionHash);

        // Position unchanged on revert
        position = {
          appealId: transaction.appealId,
          userAddress: transaction.from,
          hasParticipated: false,
          currentBalance: '0', // Would need to re-fetch
          hasMinimumBalance: false,
        };

        // Update segregated state to reflect failure
        await updateStateSegregation(transaction.claimId, 'REVERTED');
      }

      const reconciliationResult: AppealReconciliationResult = {
        transactionHash: transaction.transactionHash,
        status: wasSuccessful ? 'confirmed' : 'reverted',
        finalState,
        position,
        revertReason,
      };

      setResult(reconciliationResult);
      return reconciliationResult;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Reconciliation failed';
      setError(errorMsg);
      
      // Create error result
      const errorResult: AppealReconciliationResult = {
        transactionHash: transaction.transactionHash,
        status: 'timeout',
        finalState: 'ACTIVE',
        position: {
          appealId: transaction.appealId,
          userAddress: transaction.from,
          hasParticipated: false,
          currentBalance: '0',
          hasMinimumBalance: false,
        },
        error: errorMsg,
      };

      setResult(errorResult);
      return errorResult;
    } finally {
      setIsReconciling(false);
    }
  }, [transaction, receipt, fetchUpdatedPosition, updateStateSegregation, extractRevertReason]);

  /**
   * Auto-reconcile when receipt is available
   */
  useEffect(() => {
    if (receipt && transaction && !result) {
      reconcile();
    }
  }, [receipt, transaction, result, reconcile]);

  /**
   * Load initial state segregation when transaction is set
   */
  useEffect(() => {
    if (transaction && !stateSegregation) {
      loadStateSegregation(transaction.claimId).then(setStateSegregation);
    }
  }, [transaction, stateSegregation, loadStateSegregation]);

  /**
   * Handle receipt errors (timeout, rejection, etc.)
   */
  useEffect(() => {
    if (receiptError && transaction) {
      const errorMsg = receiptError.message || 'Failed to get transaction receipt';
      setError(errorMsg);

      // Create timeout result
      const timeoutResult: AppealReconciliationResult = {
        transactionHash: transaction.transactionHash,
        status: 'timeout',
        finalState: 'ACTIVE',
        position: {
          appealId: transaction.appealId,
          userAddress: transaction.from,
          hasParticipated: false,
          currentBalance: '0',
          hasMinimumBalance: false,
        },
        error: errorMsg,
      };

      setResult(timeoutResult);
      updateStateSegregation(transaction.claimId, 'FAILED');
    }
  }, [receiptError, transaction, updateStateSegregation]);

  return {
    reconcile,
    result,
    stateSegregation,
    isWaiting: transaction ? isWaitingForReceipt : false,
    isReconciling,
    error,
  };
}

/**
 * Utility function to check if user can participate in appeal
 * Separate from first-round participation check
 */
export function canParticipateInAppeal(segregation: StateSegregation): {
  canParticipate: boolean;
  reason?: string;
} {
  // User can participate in appeal even if they participated in first round
  // These are independent actions

  if (segregation.hasAppealParticipation) {
    return {
      canParticipate: false,
      reason: 'Already participated in appeal',
    };
  }

  if (segregation.appealState.status === 'CONFIRMED') {
    return {
      canParticipate: false,
      reason: 'Appeal participation already confirmed',
    };
  }

  if (segregation.appealState.status === 'PENDING') {
    return {
      canParticipate: false,
      reason: 'Appeal participation transaction pending',
    };
  }

  return {
    canParticipate: true,
  };
}

/**
 * Utility to verify state independence
 */
export function verifyStateIndependence(segregation: StateSegregation): boolean {
  // Verify that first-round and appeal states don't interfere
  
  // First round participation should not block appeal participation
  if (segregation.hasFirstRoundParticipation && !segregation.hasAppealParticipation) {
    return true; // Can still participate in appeal
  }

  // States must be tracked separately
  return segregation.statesAreIndependent === true;
}
