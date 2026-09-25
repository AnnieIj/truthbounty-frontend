/**
 * Hook for detecting when finalization is permissionlessly callable
 * Checks that all settlements are complete and finalization window is open
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import {
  SettlementAction,
  FinalizationRequirements,
  StateValidation,
} from '@/app/types/settlement';
import { getReleaseChainId } from '@/lib/contracts/registry';

interface UseFinalizationDetectionConfig {
  claimId: string;
  contractAddress: string;
  expectedChainId?: number;
  pollInterval?: number;
}

interface FinalizationDetectionResult {
  finalizationAction: SettlementAction | null;
  requirements: FinalizationRequirements | null;
  isLoading: boolean;
  error: string | null;
  validation: StateValidation | null;
}

const OPTIMISM_MAINNET_CHAIN_ID = 10;
const OPTIMISM_SEPOLIA_CHAIN_ID = 11155420;
const DEFAULT_POLL_INTERVAL = 5000; // 5 seconds

/**
 * Detect when finalization is permissionlessly callable
 * Validates all settlement conditions before allowing finalization
 */
export function useFinalizationDetection(
  config: UseFinalizationDetectionConfig
): FinalizationDetectionResult {
  const { claimId, contractAddress, expectedChainId = getReleaseChainId(), pollInterval = DEFAULT_POLL_INTERVAL } = config;
  
  const { address: userAddress, isConnected } = useAccount();
  const currentChainId = useChainId();
  
  const [finalizationAction, setFinalizationAction] = useState<SettlementAction | null>(null);
  const [requirements, setRequirements] = useState<FinalizationRequirements | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<StateValidation | null>(null);

  /**
   * Validate wallet connection and chain
   */
  const validateState = useCallback((): StateValidation => {
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
   * Fetch finalization requirements from contract/indexer
   */
  const fetchFinalizationRequirements = useCallback(
    async (claimId: string): Promise<FinalizationRequirements> => {
      try {
        // In production, this would:
        // 1. Query contract.getFinalizationRequirements(claimId)
        // 2. Check if all settlements are completed
        // 3. Verify no active appeals exist
        // 4. Calculate time remaining in finalization window
        
        const mockRequirements: FinalizationRequirements = {
          claimId,
          allSettlementsCompleted: true,
          noActiveAppeals: true,
          finalizationWindowOpen: true,
          timeRemaining: 86400, // 24 hours
        };

        return mockRequirements;
      } catch (err) {
        throw new Error(`Failed to fetch finalization requirements: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    []
  );

  /**
   * Detect when finalization is callable
   */
  const detectFinalization = useCallback(
    async (requirements: FinalizationRequirements): Promise<SettlementAction | null> => {
      // Finalization is callable when:
      // 1. All settlements are completed
      // 2. No active appeals exist
      // 3. Finalization window is open
      if (
        requirements.allSettlementsCompleted &&
        requirements.noActiveAppeals &&
        requirements.finalizationWindowOpen
      ) {
        return {
          type: 'FINALIZE',
          claimId: requirements.claimId,
          isCallable: true,
        };
      }

      // Provide reason if not callable
      if (!requirements.allSettlementsCompleted) {
        return {
          type: 'FINALIZE',
          claimId: requirements.claimId,
          isCallable: false,
          reason: 'Not all settlements are completed',
        };
      }

      if (!requirements.noActiveAppeals) {
        return {
          type: 'FINALIZE',
          claimId: requirements.claimId,
          isCallable: false,
          reason: 'Active appeals exist',
        };
      }

      if (!requirements.finalizationWindowOpen) {
        return {
          type: 'FINALIZE',
          claimId: requirements.claimId,
          isCallable: false,
          reason: `Finalization window closed. Time remaining: ${requirements.timeRemaining}s`,
        };
      }

      return null;
    },
    []
  );

  /**
   * Main detection logic
   */
  const detectAction = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Validate state first
      const stateValidation = validateState();
      setValidation(stateValidation);

      if (!stateValidation.isValid) {
        setFinalizationAction(null);
        setRequirements(null);
        setIsLoading(false);
        return;
      }

      // Fetch finalization requirements
      const reqs = await fetchFinalizationRequirements(claimId);
      setRequirements(reqs);

      // Detect finalization action
      const action = await detectFinalization(reqs);
      setFinalizationAction(action);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error detecting finalization');
      setFinalizationAction(null);
      setRequirements(null);
    } finally {
      setIsLoading(false);
    }
  }, [claimId, validateState, fetchFinalizationRequirements, detectFinalization]);

  /**
   * Poll for finalization readiness
   */
  useEffect(() => {
    if (!isConnected) {
      setValidation(validateState());
      return;
    }

    detectAction();
    const interval = setInterval(detectAction, pollInterval);

    return () => clearInterval(interval);
  }, [isConnected, detectAction, pollInterval, validateState]);

  return {
    finalizationAction,
    requirements,
    isLoading,
    error,
    validation,
  };
}
