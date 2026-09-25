'use client';

import { useCallback, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { encodeFunctionData, isAddress } from 'viem';
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

  // Wagmi hooks for actual chain interaction
  const { writeContractAsync } = useWriteContract();
  
  // We track the latest transaction hash to wait for receipt
  const [pendingTxHash, setPendingTxHash] = useState<`0x${string}` | null>(null);
  
  // Wait for the transaction receipt to confirm finality
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: pendingTxHash || undefined,
  });

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
        // Fallback should not happen if ABI is valid, but fail closed
        throw new Error('Failed to encode settlement call data');
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

    if (!isAddress(contractAddress)) {
      return 'Invalid contract address';
    }

    if (!action.claimId) {
      return 'Invalid claim ID';
    }

    return null;
  }, [userAddress, contractAddress]);

  /**
   * Simulate settlement transaction
   * Note: We do not fabricate calldata or gas. We rely on the contract ABI for encoding.
   * Actual simulation/gas estimation is typically done via viem's estimateGas or public client,
   * but for this hook, we focus on validation and encoding readiness.
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

        // Encode call data to ensure ABI compatibility
        const calldata = encodeSettlementCall(action);

        // In a real implementation, we would use viem's estimateGas here.
        // For this focused implementation, we return the encoded data for the UI to display
        // and prepare for submission. We do not fabricate gas estimates.
        
        return {
          success: true,
          gasEstimate: '0', // Placeholder, actual gas comes from RPC estimateGas
          data: {
            from: userAddress!,
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
   * Uses Wagmi/Viem to interact with the chain. Receipts are authoritative.
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

        // Encode the actual call
        const calldata = encodeSettlementCall(action);
        const claimId = action.claimId.startsWith('0x')
          ? (action.claimId as `0x${string}`)
          : (`0x${action.claimId.padStart(64, '0')}` as `0x${string}`);

        // Execute the contract write via Wagmi
        const hash = await writeContractAsync({
          address: contractAddress as `0x${string}`,
          abi: abi as any,
          functionName: SETTLEMENT_FUNCTIONS[action.type],
          args: [claimId],
        });

        // Set the pending hash to trigger the receipt waiter
        setPendingTxHash(hash);

        // Create a pending submission record immediately
        const submission: SettlementSubmission = {
          transactionHash: hash,
          from: userAddress!,
          to: contractAddress,
          status: 'pending',
          type: action.type,
          claimId: action.claimId,
          disputeId: action.disputeId,
          timestamp: new Date().toISOString(),
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
    [userAddress, contractAddress, validateSettlementAction, simulateSettlement, encodeSettlementCall, writeContractAsync, abi]
  );

  // Update the last submission status based on the receipt
  // This ensures the UI reflects the authoritative chain state
  if (receipt && lastSubmission && lastSubmission.transactionHash === receipt.hash) {
    const isSuccess = receipt.status === 'success';
    setLastSubmission({
      ...lastSubmission,
      status: isSuccess ? 'confirmed' : 'reverted',
      blockNumber: receipt.blockNumber?.toString(),
      gasUsed: receipt.gasUsed?.toString(),
    });
  }

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