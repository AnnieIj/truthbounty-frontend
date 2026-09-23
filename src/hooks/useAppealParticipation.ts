/**
 * Hook for appeal participation transaction encoding and submission
 * Handles simulation, validation, and submission of appeal votes
 */

'use client';

import { useCallback, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import {
  AppealDecision,
  AppealParticipationPayload,
  AppealParticipationTransaction,
  AppealSimulationResult,
  AppealValidation,
  AppealParticipationContext,
  AppealParticipationStatus,
} from '@/app/types/appeal';
import { evaluateWriteTarget } from '@/lib/contracts/write-gate';
import { getReleaseChainId } from '@/lib/contracts/registry';

interface UseAppealParticipationConfig {
  contractAddress: string;
  abi?: unknown[]; // Contract ABI for encoding
  expectedChainId?: number;
  artifactVersion?: string; // Contract version for safety
}

interface AppealParticipationResult {
  simulateParticipation: (
    context: AppealParticipationContext,
    decision: AppealDecision,
    stakeAmount: string
  ) => Promise<AppealSimulationResult>;
  
  submitParticipation: (
    context: AppealParticipationContext,
    decision: AppealDecision,
    stakeAmount: string
  ) => Promise<AppealParticipationTransaction>;
  
  validateParticipation: (
    context: AppealParticipationContext,
    decision: AppealDecision,
    stakeAmount: string
  ) => AppealValidation;
  
  isSimulating: boolean;
  isSubmitting: boolean;
  error: string | null;
  lastTransaction: AppealParticipationTransaction | null;
}

const OPTIMISM_MAINNET_CHAIN_ID = 10;
const OPTIMISM_SEPOLIA_CHAIN_ID = 11155420;
const EXPECTED_ARTIFACT_VERSION = '2.0.0';

// Function selectors for appeal participation
const APPEAL_SUPPORT_SELECTOR = '0xabc12345'; // participateInAppeal(bytes32,bool,uint256) where bool=true
const APPEAL_OPPOSE_SELECTOR = '0xdef67890';  // participateInAppeal(bytes32,bool,uint256) where bool=false

/**
 * Hook for encoding and submitting appeal participation transactions
 */
export function useAppealParticipation(
  config: UseAppealParticipationConfig
): AppealParticipationResult {
  const {
    contractAddress,
    abi,
    expectedChainId = getReleaseChainId(),
    artifactVersion = EXPECTED_ARTIFACT_VERSION,
  } = config;

  const { address: userAddress, isConnected } = useAccount();
  const currentChainId = useChainId();

  const [isSimulating, setIsSimulating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTransaction, setLastTransaction] = useState<AppealParticipationTransaction | null>(null);

  /**
   * Encode appeal participation call data
   */
  const encodeParticipationCall = useCallback(
    (appealId: string, decision: AppealDecision, stakeAmount: string): string => {
      // In production, this would use Viem to encode:
      // import { encodeFunctionData } from 'viem'
      // const data = encodeFunctionData({
      //   abi: contractAbi,
      //   functionName: 'participateInAppeal',
      //   args: [appealId, decision === 'SUPPORT', BigInt(stakeAmount)]
      // })

      // Mock encoding for now
      const selector = decision === 'SUPPORT' ? APPEAL_SUPPORT_SELECTOR : APPEAL_OPPOSE_SELECTOR;
      
      // Encode: appealId (bytes32) + decision (bool as uint256) + stakeAmount (uint256)
      const encodedAppealId = appealId.replace(/[^0-9a-fA-F]/g, '').padStart(64, '0');
      const encodedDecision = (decision === 'SUPPORT' ? '1' : '0').padStart(64, '0');
      const encodedStake = BigInt(stakeAmount).toString(16).padStart(64, '0');

      return selector + encodedAppealId + encodedDecision + encodedStake;
    },
    [abi]
  );

  /**
   * Validate appeal participation
   */
  const validateParticipation = useCallback(
    (
      context: AppealParticipationContext,
      decision: AppealDecision,
      stakeAmount: string
    ): AppealValidation => {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check appeal is active
      const appealActive = context.deadline.isActive && !context.deadline.hasEnded;
      if (!appealActive) {
        errors.push('Appeal period has ended or has not started');
      }

      // Check wallet connected
      const walletConnected = isConnected && !!userAddress;
      if (!walletConnected) {
        errors.push('Wallet not connected');
      }

      // Check correct chain
      const correctChain = currentChainId === expectedChainId;
      if (!correctChain) {
        errors.push(`Wrong network. Expected chain ${expectedChainId}, got ${currentChainId}`);
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
      const contractAddressValid = writeTarget.ok
        ? true
        : contractAddress.match(/^0x[a-fA-F0-9]{40}$/) !== null;
      if (!contractAddressValid) {
        errors.push('Invalid contract address format');
      }

      // Check artifact version (in production, query from contract)
      const artifactVersionValid = writeTarget.ok;
      if (!artifactVersionValid && writeTarget.errors.length === 0) {
        errors.push(`Contract version mismatch. Expected ${artifactVersion}`);
      }

      // Check not already participated
      const notAlreadyParticipated = !context.walletPosition.hasParticipated;
      if (!notAlreadyParticipated) {
        errors.push('You have already participated in this appeal');
      }

      // Validate stake amount
      let sufficientBalance = false;
      let stakeWithinBounds = false;

      try {
        const stakeBigInt = BigInt(stakeAmount);
        const minStakeBigInt = BigInt(context.stakeBounds.minStake);
        const maxStakeBigInt = context.stakeBounds.maxStake
          ? BigInt(context.stakeBounds.maxStake)
          : BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
        const balanceBigInt = BigInt(context.walletPosition.currentBalance);

        sufficientBalance = balanceBigInt >= stakeBigInt;
        if (!sufficientBalance) {
          errors.push('Insufficient balance for stake amount');
        }

        stakeWithinBounds = stakeBigInt >= minStakeBigInt && stakeBigInt <= maxStakeBigInt;
        if (stakeBigInt < minStakeBigInt) {
          errors.push(`Stake amount below minimum of ${context.stakeBounds.minStake} wei`);
        }
        if (stakeBigInt > maxStakeBigInt) {
          errors.push(`Stake amount exceeds maximum of ${context.stakeBounds.maxStake} wei`);
        }

        // Warnings for suboptimal stakes
        if (context.stakeBounds.recommendedStake) {
          const recommendedBigInt = BigInt(context.stakeBounds.recommendedStake);
          if (stakeBigInt < recommendedBigInt / BigInt(2)) {
            warnings.push('Stake amount is significantly below recommended amount');
          }
        }
      } catch (err) {
        errors.push('Invalid stake amount format');
      }

      // Check decision is valid
      if (decision !== 'SUPPORT' && decision !== 'OPPOSE') {
        errors.push('Invalid decision. Must be SUPPORT or OPPOSE');
      }

      const validation: AppealValidation = {
        isValid: errors.length === 0,
        errors,
        warnings,
        checks: {
          appealActive,
          walletConnected,
          correctChain,
          sufficientBalance,
          notAlreadyParticipated,
          stakeWithinBounds,
          contractAddressValid,
          artifactVersionValid,
        },
      };

      return validation;
    },
    [isConnected, userAddress, currentChainId, expectedChainId, contractAddress, artifactVersion]
  );

  /**
   * Simulate appeal participation
   */
  const simulateParticipation = useCallback(
    async (
      context: AppealParticipationContext,
      decision: AppealDecision,
      stakeAmount: string
    ): Promise<AppealSimulationResult> => {
      setIsSimulating(true);
      setError(null);

      try {
        // Validate first
        const validation = validateParticipation(context, decision, stakeAmount);
        if (!validation.isValid) {
          return {
            success: false,
            error: validation.errors.join('; '),
          };
        }

        // Encode call data
        const calldata = encodeParticipationCall(context.snapshot.appealId, decision, stakeAmount);

        // In production, this would:
        // 1. Use Viem's simulateContract to test the transaction
        // 2. Estimate gas with proper buffer
        // 3. Calculate projected state after participation
        // 4. Estimate potential rewards based on current distribution

        // Mock simulation
        const gasEstimate = '180000'; // Estimated gas for appeal participation

        // Calculate projected state
        const stakeBigInt = BigInt(stakeAmount);
        const currentSupportBigInt = BigInt(context.stakeBounds.totalSupportStake);
        const currentOpposeBigInt = BigInt(context.stakeBounds.totalOpposeStake);

        const newSupportTotal =
          decision === 'SUPPORT'
            ? (currentSupportBigInt + stakeBigInt).toString()
            : currentSupportBigInt.toString();

        const newOpposeTotal =
          decision === 'OPPOSE'
            ? (currentOpposeBigInt + stakeBigInt).toString()
            : currentOpposeBigInt.toString();

        // Estimate potential reward (simplified calculation)
        const totalStake = currentSupportBigInt + currentOpposeBigInt + stakeBigInt;
        const potentialReward = (stakeBigInt * BigInt(150)) / BigInt(100); // 1.5x if majority wins

        return {
          success: true,
          gasEstimate,
          projectedState: {
            newSupportTotal,
            newOpposeTotal,
            potentialReward: potentialReward.toString(),
            riskAmount: stakeAmount,
          },
          data: {
            from: userAddress!,
            to: contractAddress,
            value: '0', // No ETH sent, just token approval
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
    [userAddress, contractAddress, validateParticipation, encodeParticipationCall]
  );

  /**
   * Submit appeal participation transaction
   */
  const submitParticipation = useCallback(
    async (
      context: AppealParticipationContext,
      decision: AppealDecision,
      stakeAmount: string
    ): Promise<AppealParticipationTransaction> => {
      setIsSubmitting(true);
      setError(null);

      try {
        // Validate
        const validation = validateParticipation(context, decision, stakeAmount);
        if (!validation.isValid) {
          throw new Error(validation.errors.join('; '));
        }

        // Simulate first to catch errors early
        const simulation = await simulateParticipation(context, decision, stakeAmount);
        if (!simulation.success) {
          throw new Error(simulation.error || 'Simulation failed');
        }

        // In production, this would:
        // 1. Use Wagmi's useWriteContract hook
        // 2. Send transaction via user's connected wallet
        // 3. Return transaction hash immediately (don't wait for confirmation)
        // 4. Let useStateReconciliation handle confirmation tracking

        // Mock transaction submission
        await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate network delay

        const mockTxHash = `0x${Math.random().toString(16).slice(2).padEnd(64, '0')}`;
        const timestamp = new Date().toISOString();

        const transaction: AppealParticipationTransaction = {
          transactionHash: mockTxHash,
          from: userAddress!,
          to: contractAddress,
          status: 'PENDING',
          appealId: context.snapshot.appealId,
          claimId: context.snapshot.claimId,
          disputeId: context.snapshot.disputeId,
          decision,
          stakeAmount,
          timestamp,
        };

        setLastTransaction(transaction);
        return transaction;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Submission failed';
        setError(errorMsg);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [userAddress, contractAddress, validateParticipation, simulateParticipation]
  );

  return {
    simulateParticipation,
    submitParticipation,
    validateParticipation,
    isSimulating,
    isSubmitting,
    error,
    lastTransaction,
  };
}
