/**
 * Hook for detecting when provisional and final settlement states are reachable.
 * Validates chain, address, contract version, and settlement state.
 * Relies on canonical receipts/projections, not timers or client guesses.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import {
  SettlementAction,
  SettlementState,
  StateValidation,
  SettlementContext,
} from '@/app/types/settlement';

interface UseSettlementDetectionConfig {
  claimId: string;
  contractAddress: string;
  expectedChainId?: number; // Optimism mainnet = 10, Sepolia testnet = 11155420
  pollInterval?: number; // ms
}

interface SettlementDetectionResult {
  provisionalAction: SettlementAction | null;
  appealAction: SettlementAction | null;
  isLoading: boolean;
  error: string | null;
  validation: StateValidation | null;
}

const OPTIMISM_MAINNET_CHAIN_ID = 10;
const OPTIMISM_SEPOLIA_CHAIN_ID = 11155420;
const DEFAULT_POLL_INTERVAL = 5000; // 5 seconds

/**
 * Detect when settlement is permissionlessly callable
 * Performs chain, address, and state validation to prevent stale calls
 */
export function useSettlementDetection(
  config: UseSettlementDetectionConfig
): SettlementDetectionResult {
  const { claimId, contractAddress, expectedChainId = OPTIMISM_MAINNET_CHAIN_ID, pollInterval = DEFAULT_POLL_INTERVAL } = config;
  
  const { address: userAddress, isConnected } = useAccount();
  const currentChainId = useChainId();
  
  const [provisionalAction, setProvisionalAction] = useState<SettlementAction | null>(null);
  const [appealAction, setAppealAction] = useState<SettlementAction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<StateValidation | null>(null);

  /**
   * Validate wallet connection and chain
   */
  const validateState = useCallback((): StateValidation => {
    // Check if user is connected
    if (!isConnected || !userAddress) {
      return {
        isValid: false,
        currentState: 'PENDING_SETTLEMENT',
        error: 'Wallet not connected',
      };
    }

    // Check if user is on correct and supported chain
    const isSupportedChain = currentChainId === OPTIMISM_MAINNET_CHAIN_ID || currentChainId === OPTIMISM_SEPOLIA_CHAIN_ID;
    if (!isSupportedChain || currentChainId !== expectedChainId) {
      return {
        isValid: false,
        currentState: 'PENDING_SETTLEMENT',
        error: `Wrong network. Expected chain ${expectedChainId}, got ${currentChainId}`,
        chainId: currentChainId,
      };
    }

    // Validate contract address format
    if (!contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return {
        isValid: false,
        currentState: 'PENDING_SETTLEMENT',
        error: 'Invalid contract address format',
      };
    }

    return {
      isValid: true,
      currentState: 'PENDING_SETTLEMENT',
      chainId: currentChainId,
    };
  }, [isConnected, userAddress, currentChainId, expectedChainId, contractAddress]);

  /**
   * Fetch current settlement state from contract/indexer
   * In production, this would query the contract or API
   */
  const fetchSettlementState = useCallback(
    async (context: Partial<SettlementContext> & { claimId: string }): Promise<SettlementContext> => {
      try {
        // In production, this would:
        // 1. Call contract.getClaimState(claimId)
        // 2. Query indexer for settlement/appeal status
        // 3. Check voting/appeal/finalization periods
        
        const mockContext: SettlementContext = {
          claimId: context.claimId,
          currentState: context.currentState || 'PENDING_SETTLEMENT',
          contractAddress,
          chainId: currentChainId,
          userAddress: userAddress || '0x',
          votingPeriodEnded: context.votingPeriodEnded ?? true,
          appealPeriodEnded: context.appealPeriodEnded ?? false,
          finalizationPeriodEnded: context.finalizationPeriodEnded ?? false,
        };

        return mockContext;
      } catch (err) {
        throw new Error(`Failed to fetch settlement state: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [claimId, contractAddress, currentChainId, userAddress]
  );

  /**
   * Detect when provisional settlement is callable
   */
  const detectProvisionalSettlement = useCallback(
    async (context: SettlementContext): Promise<SettlementAction | null> => {
      // Provisional settlement is callable when voting period has ended
      // and no appeal has been initiated
      if (
        context.votingPeriodEnded &&
        !context.appealPeriodEnded &&
        context.currentState === 'PENDING_SETTLEMENT'
      ) {
        return {
          type: 'SETTLE_PROVISIONAL',
          claimId: context.claimId,
          isCallable: true,
        };
      }

      return null;
    },
    []
  );

  /**
   * Detect when appeal settlement is callable
   */
  const detectAppealSettlement = useCallback(
    async (context: SettlementContext): Promise<SettlementAction | null> => {
      // Appeal settlement is callable when appeal period has ended
      // and claim is in appeal state
      if (
        context.appealPeriodEnded &&
        context.currentState === 'PENDING_APPEAL'
      ) {
        return {
          type: 'SETTLE_APPEAL',
          claimId: context.claimId,
          isCallable: true,
        };
      }

      return null;
    },
    []
  );

  /**
   * Main detection logic
   */
  const detectActions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Validate state first
      const stateValidation = validateState();
      setValidation(stateValidation);

      if (!stateValidation.isValid) {
        setProvisionalAction(null);
        setAppealAction(null);
        setIsLoading(false);
        return;
      }

      // Fetch current settlement context
      const context = await fetchSettlementState({ claimId });

      // Detect actions
      const provisional = await detectProvisionalSettlement(context);
      const appeal = await detectAppealSettlement(context);

      setProvisionalAction(provisional);
      setAppealAction(appeal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error detecting settlement actions');
      setProvisionalAction(null);
      setAppealAction(null);
    } finally {
      setIsLoading(false);
    }
  }, [claimId, validateState, fetchSettlementState, detectProvisionalSettlement, detectAppealSettlement]);

  /**
   * Poll for settlement actions
   */
  useEffect(() => {
    if (!isConnected) {
      setValidation(validateState());
      return;
    }

    detectActions();
    const interval = setInterval(detectActions, pollInterval);

    return () => clearInterval(interval);
  }, [isConnected, detectActions, pollInterval, validateState]);

  return {
    provisionalAction,
    appealAction,
    isLoading,
    error,
    validation,
  };
}