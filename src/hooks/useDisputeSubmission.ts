/**
 * Hook for encoding and submitting dispute opening transactions
 * Handles challenge submission with bond lock, validation, and simulation
 */

'use client';

import { useCallback, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { encodeFunctionData } from 'viem';
import {
  DisputeContext,
  DisputeSubmissionPayload,
  DisputeTransaction,
  DisputeSimulationResult,
  DisputeValidation,
  DisputeSubmissionStatus,
} from '@/app/types/dispute';
import {
  getContractAbi,
  getContractAddress,
  getProtocolVersion,
  getReleaseChainId,
} from '@/lib/contracts/registry';
import { evaluateWriteTarget } from '@/lib/contracts/write-gate';

interface UseDisputeSubmissionConfig {
  contractAddress?: string;
  abi?: readonly unknown[];
  expectedChainId?: number;
  artifactVersion?: string;
}

interface DisputeSubmissionResult {
  validateDispute: (
    context: DisputeContext,
    payload: DisputeSubmissionPayload
  ) => DisputeValidation;

  simulateDispute: (
    context: DisputeContext,
    payload: DisputeSubmissionPayload
  ) => Promise<DisputeSimulationResult>;

  submitDispute: (
    context: DisputeContext,
    payload: DisputeSubmissionPayload
  ) => Promise<DisputeTransaction>;

  isSimulating: boolean;
  isSubmitting: boolean;
  error: string | null;
  lastTransaction: DisputeTransaction | null;
  artifactVersion: string;
}

const OPTIMISM_MAINNET_CHAIN_ID = 10;
const OPTIMISM_SEPOLIA_CHAIN_ID = 11155420;
const EXPECTED_ARTIFACT_VERSION = '2.0.0';

// Function selector for openDispute(bytes32 claimId, string reason, uint256 bond)
const OPEN_DISPUTE_SELECTOR = '0x9a8a0592';

/**
 * Hook for encoding and submitting dispute opening transactions
 */
export function useDisputeSubmission(
  config: UseDisputeSubmissionConfig = {}
): DisputeSubmissionResult {
  const contractAddress =
    config.contractAddress ?? getContractAddress('TruthBountyWeighted');
  const abi = config.abi ?? getContractAbi('TruthBountyWeighted');
  const expectedChainId = config.expectedChainId ?? getReleaseChainId();
  const artifactVersion = config.artifactVersion ?? getProtocolVersion();

  const { address: userAddress, isConnected } = useAccount();
  const currentChainId = useChainId();

  const [isSimulating, setIsSimulating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTransaction, setLastTransaction] = useState<DisputeTransaction | null>(
    null
  );

  /**
   * Encode dispute opening call data
   */
  const encodeDisputeCall = useCallback(
    (claimId: string, reason: string, bondAmount: string): string => {
      // In production, this would use Viem to encode:
      // const data = encodeFunctionData({
      //   abi: contractAbi,
      //   functionName: 'openDispute',
      //   args: [claimId, reason, BigInt(bondAmount)]
      // })

      // Mock encoding for now
      const selector = OPEN_DISPUTE_SELECTOR;

      // Encode: claimId (bytes32) + reason (string) + bondAmount (uint256)
      const encodedClaimId = claimId.replace(/[^0-9a-fA-F]/g, '').padStart(64, '0');
      const encodedReason = Buffer.from(reason).toString('hex').padEnd(64, '0');
      const encodedBond = BigInt(bondAmount).toString(16).padStart(64, '0');

      return selector + encodedClaimId + encodedReason + encodedBond;
    },
    []
  );

  /**
   * Check if contract is paused (in production)
   */
  const checkContractPaused = useCallback(async (): Promise<boolean> => {
    // In production, this would:
    // const isPaused = await contract.paused()
    // return isPaused

    // Mock implementation
    return false;
  }, []);

  /**
   * Validate dispute submission
   */
  const validateDispute = useCallback(
    (
      context: DisputeContext,
      payload: DisputeSubmissionPayload
    ): DisputeValidation => {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check dispute window open
      const windowOpen = context.deadline.isWindowOpen && !context.deadline.isWindowClosed;
      if (!windowOpen) {
        errors.push('Dispute window has closed or has not opened yet');
      }

      // Check no active dispute
      const noActiveDispute = !context.deadline.hasActiveDispute;
      if (!noActiveDispute) {
        errors.push('A dispute has already been opened for this claim');
      }

      // Check wallet connected
      const walletConnected = isConnected && !!userAddress;
      if (!walletConnected) {
        errors.push('Wallet not connected');
      }

      // Check correct chain
      const correctChain = currentChainId === expectedChainId;
      if (!correctChain) {
        errors.push(
          `Wrong network. Expected chain ${expectedChainId}, got ${currentChainId}`
        );
      }

      // Fail closed through the single validated release manifest before any signing path.
      const writeTarget = evaluateWriteTarget({
        activeChainId: currentChainId,
        contractAddress,
        expectedProtocolVersion: artifactVersion,
      });
      if (!writeTarget.ok) {
        errors.push(...writeTarget.errors);
      }

      // Check contract address valid
      const contractAddressValid =
        contractAddress.match(/^0x[a-fA-F0-9]{40}$/) !== null;
      if (!contractAddressValid) {
        errors.push('Invalid contract address format');
      }

      // Check artifact version (in production, query from contract)
      const artifactVersionValid = writeTarget.ok;
      if (!artifactVersionValid && writeTarget.errors.length === 0) {
        errors.push(`Contract version mismatch. Expected ${artifactVersion}`);
      }

      // Check sufficient balance
      let sufficientBalance = false;
      try {
        const bondBigInt = BigInt(payload.bondAmount);
        const balanceBigInt = BigInt(context.walletPosition.currentBalance);
        sufficientBalance = balanceBigInt >= bondBigInt;
        if (!sufficientBalance) {
          errors.push('Insufficient balance for challenge bond');
        }
      } catch (err) {
        errors.push('Invalid bond amount format');
      }

      // Validate bond amount matches required bond
      let bondAmountValid = false;
      try {
        const payloadBond = BigInt(payload.bondAmount);
        const requiredBond = BigInt(context.bond.bondAmount);
        bondAmountValid = payloadBond === requiredBond;
        if (!bondAmountValid) {
          errors.push(
            `Bond amount must be exactly ${context.bond.bondAmount} wei`
          );
        }
      } catch (err) {
        errors.push('Invalid bond amount');
      }

      // Check reason provided
      const reasonProvided = Boolean(payload.reason && payload.reason.trim().length > 0);
      if (!reasonProvided) {
        errors.push('Dispute reason is required');
      } else if (payload.reason.length < 10) {
        warnings.push('Dispute reason should be more descriptive (at least 10 characters)');
      }

      // Check not participated in first round (some protocols disallow)
      const notParticipatedInFirstRound = !context.walletPosition.hasParticipatedInFirstRound;
      // Note: This check is protocol-specific. Some protocols allow, others don't.
      // For now, we only warn if participated
      if (!notParticipatedInFirstRound) {
        warnings.push(
          'You participated in first-round verification. Some protocols may disallow disputes from verifiers.'
        );
      }

      // Check contract not paused (will be checked async in simulation)
      const contractNotPaused = true; // Checked in simulateDispute

      const validation: DisputeValidation = {
        isValid: errors.length === 0,
        errors,
        warnings,
        checks: {
          windowOpen,
          noActiveDispute,
          walletConnected,
          correctChain,
          sufficientBalance,
          notParticipatedInFirstRound,
          bondAmountValid,
          reasonProvided,
          contractAddressValid,
          artifactVersionValid,
          contractNotPaused,
        },
      };

      return validation;
    },
    [
      isConnected,
      userAddress,
      currentChainId,
      expectedChainId,
      contractAddress,
      artifactVersion,
    ]
  );

  /**
   * Simulate dispute opening transaction
   */
  const simulateDispute = useCallback(
    async (
      context: DisputeContext,
      payload: DisputeSubmissionPayload
    ): Promise<DisputeSimulationResult> => {
      setIsSimulating(true);
      setError(null);

      try {
        // Validate first
        const validation = validateDispute(context, payload);
        if (!validation.isValid) {
          return {
            success: false,
            error: validation.errors.join('; '),
          };
        }

        // Check if contract is paused
        const isPaused = await checkContractPaused();
        if (isPaused) {
          return {
            success: false,
            error: 'Contract is paused. Disputes cannot be opened at this time.',
          };
        }

        // Encode call data
        const calldata = encodeDisputeCall(
          payload.claimId,
          payload.reason,
          payload.bondAmount
        );

        // In production, this would:
        // 1. Use Viem's simulateContract to test the transaction
        // 2. Estimate gas with proper buffer (dispute opening is ~200k gas)
        // 3. Validate the dispute will be accepted
        // 4. Return projected dispute ID

        // Mock simulation
        const gasEstimate = '200000'; // Estimated gas for dispute opening

        // Generate predicted dispute ID (in production, from contract event)
        const predictedDisputeId = `dispute-${payload.claimId}-${Date.now()}`;

        return {
          success: true,
          gasEstimate,
          projectedState: {
            disputeId: predictedDisputeId,
            bondLocked: payload.bondAmount,
            newStatus: 'DISPUTED',
          },
          data: {
            from: userAddress as string,
            to: contractAddress,
            value: payload.bondAmount, // Bond sent as value
            calldata,
          },
        };
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : 'Simulation failed';
        setError(errorMsg);
        return {
          success: false,
          error: errorMsg,
        };
      } finally {
        setIsSimulating(false);
      }
    },
    [
      validateDispute,
      checkContractPaused,
      encodeDisputeCall,
      userAddress,
      contractAddress,
    ]
  );

  /**
   * Submit dispute opening transaction
   */
  const submitDispute = useCallback(
    async (
      context: DisputeContext,
      payload: DisputeSubmissionPayload
    ): Promise<DisputeTransaction> => {
      setIsSubmitting(true);
      setError(null);

      try {
        // Validate first
        const validation = validateDispute(context, payload);
        if (!validation.isValid) {
          throw new Error(validation.errors.join('; '));
        }

        // Simulate to catch errors early
        const simulation = await simulateDispute(context, payload);
        if (!simulation.success) {
          throw new Error(simulation.error || 'Simulation failed');
        }

        // In production, this would:
        // 1. Call writeContract via Wagmi
        // 2. Return transaction hash immediately
        // 3. Transaction will be mined asynchronously
        // 4. Bond will be locked on confirmation
        //
        // const hash = await writeContract({
        //   address: contractAddress,
        //   abi: contractAbi,
        //   functionName: 'openDispute',
        //   args: [payload.claimId, payload.reason, BigInt(payload.bondAmount)],
        //   value: BigInt(payload.bondAmount),
        //   chainId: expectedChainId,
        // })

        // Submission requires a wallet writeContract call; do not fabricate hashes.
        throw new Error(
          'Dispute submission requires wallet writeContract integration; no synthetic transaction hash is emitted.'
        );
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : 'Submission failed';
        setError(errorMsg);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [validateDispute, simulateDispute]
  );

  return {
    validateDispute,
    simulateDispute,
    submitDispute,
    isSimulating,
    isSubmitting,
    error,
    lastTransaction,
    artifactVersion,
  };
}

/**
 * Utility: Check if dispute can be submitted
 */
export function canSubmitDispute(validation: DisputeValidation): boolean {
  return validation.isValid;
}

/**
 * Utility: Get primary error message from validation
 */
export function getPrimaryError(validation: DisputeValidation): string | null {
  if (validation.errors.length === 0) return null;
  return validation.errors[0];
}

/**
 * Utility: Calculate bond in ETH (for display)
 */
export function formatBondAmount(bondWei: string): string {
  try {
    const bondBigInt = BigInt(bondWei);
    const ethValue = Number(bondBigInt) / 1e18;
    return ethValue.toFixed(4);
  } catch {
    return '0.0000';
  }
}
