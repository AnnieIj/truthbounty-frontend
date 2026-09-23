'use client';

import { useCallback, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { encodeFunctionData } from 'viem';
import {
  SettlementAction,
  SimulationResult,
  SettlementSubmission,
} from '@/app/types/settlement';
import {
  getContractAbi,
  getContractAddress,
  getProtocolVersion,
  getReleaseChainId,
} from '@/lib/contracts/registry';
import { evaluateWriteTarget } from '@/lib/contracts/write-gate';

interface UseSettlementSubmissionConfig {
  contractAddress?: string;
  abi?: readonly unknown[];
}

const SETTLEMENT_FUNCTIONS: Record<string, 'settleProvisional' | 'settleAppeal' | 'finalize'> = {
  SETTLE_PROVISIONAL: 'settleProvisional',
  SETTLE_APPEAL: 'settleAppeal',
  FINALIZE: 'finalize',
  CLAIM_SETTLEMENT: 'settleProvisional',
  CLAIM_APPEAL: 'settleAppeal',
};

interface SettlementSubmissionResult {
  simulateSettlement: (action: SettlementAction) => Promise<SimulationResult>;
  submitSettlement: (action: SettlementAction) => Promise<SettlementSubmission>;
  isSimulating: boolean;
  isSubmitting: boolean;
  error: string | null;
  lastSubmission: SettlementSubmission | null;
  artifactVersion: string;
}

export function useSettlementSubmission(
  config: UseSettlementSubmissionConfig = {},
): SettlementSubmissionResult {
  const usingDefaultTarget = !config.contractAddress;
  const contractAddress = config.contractAddress ?? getContractAddress('TruthBountyWeighted');
  const abi = config.abi ?? getContractAbi('TruthBountyWeighted');
  const artifactVersion = getProtocolVersion();
  const { address: userAddress } = useAccount();
  const walletChainId = useChainId();
  const releaseChainId = getReleaseChainId();

  const [isSimulating, setIsSimulating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only populated after a real wallet write returns a hash (V2-FE-100).
  const [lastSubmission] = useState<SettlementSubmission | null>(null);

  /**
   * Encode settlement function call based on action type
   */
  const encodeSettlementCall = useCallback(
    (action: SettlementAction): string => {
      const functionName = SETTLEMENT_FUNCTIONS[action.type];
      if (!functionName) {
        throw new Error(`Unsupported settlement action: ${action.type}`);
      }

      try {
        const claimId = action.claimId.startsWith('0x')
          ? (action.claimId as `0x${string}`)
          : (`0x${action.claimId.padStart(64, '0')}` as `0x${string}`);

        return encodeFunctionData({
          abi,
          functionName,
          args: [claimId],
        });
      } catch {
        const selectors: Record<string, string> = {
          SETTLE_PROVISIONAL: '0x12345678',
          SETTLE_APPEAL: '0x23456789',
          FINALIZE: '0x34567890',
        };
        return `${selectors[action.type] || '0x12345678'}${action.claimId}`;
      }
    },
    [abi],
  );

  /**
   * Validate settlement action can be executed
   */
  const validateSettlementAction = useCallback((action: SettlementAction): string | null => {
    if (!action.isCallable) {
      return action.reason || 'Settlement action is not callable';
    }

    if (!userAddress) {
      return 'Wallet not connected';
    }

    if (!contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address';
    }

    if (!action.claimId) {
      return 'Invalid claim ID';
    }

    return null;
  }, [userAddress, contractAddress]);

  /**
   * Simulate settlement transaction
   */
  const simulateSettlement = useCallback(
    async (action: SettlementAction): Promise<SimulationResult> => {
      setIsSimulating(true);
      setError(null);

      try {
        // Validate action
        const validationError = validateSettlementAction(action);
        if (validationError) {
          return {
            success: false,
            error: validationError,
          };
        }

        // Encode call data
        const calldata = encodeSettlementCall(action);

        const gasEstimate = '250000'; // Mock gas estimate
        const fromAddress = userAddress as string;

        return {
          success: true,
          gasEstimate,
          data: {
            from: fromAddress,
            to: contractAddress,
            calldata,
          },
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Simulation failed';
        setError(errorMsg);
        return {
          success: false,
          error: errorMsg,
        };
      } finally {
        setIsSimulating(false);
      }
    },
    [userAddress, contractAddress, validateSettlementAction, encodeSettlementCall]
  );

  /**
   * Submit settlement transaction
   */
  const submitSettlement = useCallback(
    async (action: SettlementAction): Promise<SettlementSubmission> => {
      setIsSubmitting(true);
      setError(null);

      try {
        // Validate action
        const validationError = validateSettlementAction(action);
        if (validationError) {
          throw new Error(validationError);
        }

        // V2-FE-100 readiness gate — fail closed before any submission attempt
        const gate = evaluateWriteTarget({
          account: userAddress ?? null,
          chainId: walletChainId,
          expectedChainId: releaseChainId,
          targetAddress: contractAddress,
          requireCanonicalMatch: usingDefaultTarget,
        });
        if (!gate.ready) {
          throw new Error(gate.reason ?? 'Wallet is not ready for settlement submission.');
        }

        // First simulate to catch errors early
        const simulation = await simulateSettlement(action);
        if (!simulation.success) {
          throw new Error(simulation.error || 'Simulation failed');
        }

        // Never fabricate a transaction hash. Settlement requires a real
        // wallet writeContract call; without it, fail closed (V2-FE-100).
        throw new Error(
          'Settlement submission requires wallet writeContract integration; no synthetic transaction hash is emitted.',
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Submission failed';
        setError(errorMsg);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [userAddress, contractAddress, walletChainId, releaseChainId, usingDefaultTarget, validateSettlementAction, simulateSettlement]
  );

  return {
    simulateSettlement,
    submitSettlement,
    isSimulating,
    isSubmitting,
    error,
    lastSubmission,
    artifactVersion,
  };
}
