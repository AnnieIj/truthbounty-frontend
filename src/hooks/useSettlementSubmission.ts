'use client';

import { useCallback, useState } from 'react';
import { useAccount } from 'wagmi';
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
} from '@/lib/contracts/registry';

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
  const contractAddress = config.contractAddress ?? getContractAddress('TruthBountyWeighted');
  const abi = config.abi ?? getContractAbi('TruthBountyWeighted');
  const artifactVersion = getProtocolVersion();
  const { address: userAddress } = useAccount();

  const [isSimulating, setIsSimulating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSubmission, setLastSubmission] = useState<SettlementSubmission | null>(null);

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

        // First simulate to catch errors early
        const simulation = await simulateSettlement(action);
        if (!simulation.success) {
          throw new Error(simulation.error || 'Simulation failed');
        }

        throw new Error('Settlement submission is unavailable until a canonical wallet submission flow is connected.');

        const timestamp = new Date().toISOString();

        const submission: SettlementSubmission = {
          transactionHash: '',
          from: userAddress!,
          to: contractAddress,
          status: 'pending',
          type: action.type,
          claimId: action.claimId,
          disputeId: action.disputeId,
          timestamp,
        };

        setLastSubmission(submission);
        return submission;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Submission failed';
        setError(errorMsg);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [userAddress, contractAddress, validateSettlementAction, simulateSettlement]
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
