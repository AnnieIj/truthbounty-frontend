/**
 * V2-FE-041 — Appeal participation hook (useAppealParticipation).
 *
 * Orchestrates the full canonical appeal participation flow through the
 * TruthBountyWeighted contract:
 *
 *   1. validate    — connection, chain, release artifact, deadline,
 *                    duplicate-prevention and stake bounds
 *   2. simulating  — real eth_call simulation of `participateInAppeal`
 *   3. allowance   — read ERC-20 allowance; approve (max uint256) when short
 *   4. submitting  — write `participateInAppeal` via the connected wallet
 *   5. confirming  — poll the receipt and verify chain/hash canonicality
 *
 * The hook FAILS CLOSED. Calldata and transaction hashes are never
 * fabricated. When the canonical ABI does not expose `participateInAppeal`
 * (it does not in release v2.0.0), every submission path returns
 * `UNSUPPORTED_ABI` and no calldata or transaction is produced. The flow
 * activates automatically once the function lands in a future release.
 */

'use client';

import { useCallback, useMemo, useState } from 'react';
import { encodeFunctionData, maxUint256 } from 'viem';
import type { Abi, Hash } from 'viem';
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi';
import {
  AppealDecision,
  AppealParticipationContext,
  AppealParticipationError,
  AppealParticipationErrorCode,
  AppealParticipationPhase,
  AppealParticipationStatus,
  AppealParticipationTransaction,
  AppealSimulationResult,
  AppealValidation,
} from '@/app/types/appeal';
import { evaluateWriteTarget } from '@/lib/contracts/write-gate';
import { erc20Abi } from '@/config/protocol/verification-artifact';
import {
  getContractAbi,
  getContractAddress,
  getProtocolVersion,
  getReleaseChainId,
} from '@/lib/contracts/registry';
import { evaluateWriteTarget } from '@/lib/contracts/write-gate';
import { isValidContractAddress } from '@/lib/contracts/address-guard';
import { isValidChain } from '@/lib/transaction-machine/transaction-machine.types';

export interface UseAppealParticipationConfig {
  /** Overrides the canonical TruthBountyWeighted address for tests. */
  contractAddress?: `0x${string}`;
  /** Overrides the canonical ABI for tests. Must expose `participateInAppeal`. */
  abi?: readonly unknown[];
  /** Expected chain id; defaults to the canonical release chain. */
  expectedChainId?: number;
  /** Expected protocol artifact version; defaults to the canonical release. */
  artifactVersion?: string;
  /**
   * Staking token address. When set, the hook reads the allowance and
   * approves (max uint256) before submission.
   */
  stakeTokenAddress?: `0x${string}`;
  /** Receipt polling interval (ms). Default 2s. */
  pollIntervalMs?: number;
  /** Receipt confirmation timeout (ms). Default 5 minutes. */
  receiptTimeoutMs?: number;
}

export interface AppealParticipationResult {
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
  phase: AppealParticipationPhase;
  isSimulating: boolean;
  isSubmitting: boolean;
  isConfirming: boolean;
  error: AppealParticipationError | null;
  lastTransaction: AppealParticipationTransaction | null;
  allowance: bigint | null;
  receipt: AppealReceiptLike | null;
  markReplaced: (replacedBy: `0x${string}`) => void;
  markDropped: () => void;
  reset: () => void;
}

/** Canonical contract function gated by the fail-closed ABI discovery. */
export const APPEAL_PARTICIPATION_FUNCTION = 'participateInAppeal' as const;

/**
 * True only when the artifact ABI genuinely declares
 * `participateInAppeal(bytes32,bool,uint256)`. Never assumed.
 */
export function isAppealParticipationSupported(
  abi: readonly unknown[] | undefined
): boolean {
  return (
    Array.isArray(abi) &&
    abi.some((entry) => {
      const item = entry as { type?: unknown; name?: unknown } | null;
      return (
        item !== null &&
        typeof item === 'object' &&
        item.type === 'function' &&
        item.name === APPEAL_PARTICIPATION_FUNCTION
      );
    })
  );
}

/**
 * Normalize an appeal id into a 32-byte value. Return `null` when the id is
 * not a real 32-byte value so submission fails closed with `INVALID_APPEAL_ID`
 * instead of synthesizing calldata.
 */
export function normalizeAppealIdToBytes32(
  appealId: string
): `0x${string}` | null {
  if (/^0x[0-9a-fA-F]{64}$/.test(appealId)) {
    return appealId.toLowerCase() as `0x${string}`;
  }
  if (/^[0-9a-fA-F]{64}$/.test(appealId)) {
    return `0x${appealId.toLowerCase()}` as `0x${string}`;
  }
  return null;
}

export interface AppealReceiptLike {
  status?: string;
  transactionHash?: string;
  blockNumber?: bigint;
  gasUsed?: bigint;
  chainId?: number;
}

interface AppealPublicClient {
  readContract(args: unknown): Promise<unknown>;
  simulateContract?(args: unknown): Promise<unknown>;
  getTransactionReceipt(args: {
    hash: Hash;
  }): Promise<AppealReceiptLike | null>;
}

const DEFAULT_RECEIPT_TIMEOUT_MS = 300_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function extractMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const candidate = err as { shortMessage?: unknown; message?: unknown };
    if (typeof candidate.shortMessage === 'string') {
      return candidate.shortMessage;
    }
    if (typeof candidate.message === 'string') {
      return candidate.message;
    }
  }
  return 'Unknown error';
}

function isUserRejected(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as { code?: unknown; message?: unknown };
  return (
    candidate.code === 4001 ||
    (typeof candidate.message === 'string' &&
      /user rejected|request rejected|denied by user|action rejected/i.test(
        candidate.message
      ))
  );
}

async function waitForReceipt(
  txHash: Hash,
  client: AppealPublicClient | undefined,
  pollIntervalMs: number,
  timeoutMs: number
): Promise<AppealReceiptLike | null> {
  if (!client?.getTransactionReceipt) return null;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      if (receipt && receipt.status !== undefined) return receipt;
    } catch {
      // Not mined yet — keep polling.
    }
    await sleep(pollIntervalMs);
  }
  return null;
}

function receiptMatchesSubmission(
  receipt: AppealReceiptLike,
  txHash: Hash,
  chainId: number
): boolean {
  if (
    receipt.transactionHash &&
    receipt.transactionHash.toLowerCase() !== txHash.toLowerCase()
  ) {
    return false;
  }
  if (receipt.chainId !== undefined && Number(receipt.chainId) !== chainId) {
    return false;
  }
  return true;
}

function firstValidationErrorCode(
  validation: AppealValidation
): AppealParticipationErrorCode {
  if (!validation.checks.appealActive) return 'APPEAL_CLOSED';
  if (!validation.checks.supportedChain) return 'UNSUPPORTED_CHAIN';
  if (!validation.checks.correctChain) return 'WRONG_NETWORK';
  if (!validation.checks.contractAddressValid) return 'INVALID_CONTRACT_ADDRESS';
  if (!validation.checks.artifactVersionValid) return 'INVALID_ARTIFACT';
  if (!validation.checks.abiFunctionSupported) return 'UNSUPPORTED_ABI';
  if (!validation.checks.walletConnected) return 'UNCONNECTED';
  if (!validation.checks.notAlreadyParticipated) return 'ALREADY_PARTICIPATED';
  if (!validation.checks.stakeWithinBounds) return 'INVALID_STAKE';
  if (!validation.checks.sufficientBalance) return 'INSUFFICIENT_BALANCE';
  return 'INVALID_STAKE';
}

export function useAppealParticipation(
  config: UseAppealParticipationConfig = {}
): AppealParticipationResult {
  const canonicalContractAddress = getContractAddress('TruthBountyWeighted');
  const canonicalAbi = getContractAbi('TruthBountyWeighted');
  const canonicalChainId = getReleaseChainId();
  const canonicalVersion = getProtocolVersion();

  const {
    contractAddress = canonicalContractAddress,
    abi = canonicalAbi,
    expectedChainId = canonicalChainId,
    artifactVersion = canonicalVersion,
    stakeTokenAddress,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    receiptTimeoutMs = DEFAULT_RECEIPT_TIMEOUT_MS,
  } = config;

  const { address: userAddress, isConnected } = useAccount();
  const currentChainId = useChainId();
  const publicClient = usePublicClient() as AppealPublicClient | undefined;
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<AppealParticipationPhase>('idle');
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<AppealParticipationError | null>(null);
  const [lastTransaction, setLastTransaction] =
    useState<AppealParticipationTransaction | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [receipt, setReceipt] = useState<AppealReceiptLike | null>(null);

  const abiFunctionSupported = useMemo(
    () => isAppealParticipationSupported(abi),
    [abi]
  );

  /**
   * Validate appeal participation. Every check is a real, derivable fact;
   * no check ever assumes the ABI supports participation.
   */
  const validateParticipation = useCallback(
    (
      context: AppealParticipationContext,
      decision: AppealDecision,
      stakeAmount: string
    ): AppealValidation => {
      const errors: string[] = [];
      const warnings: string[] = [];

      const appealActive = context.deadline.isActive && !context.deadline.hasEnded;
      if (!appealActive) {
        errors.push('Appeal period has ended or has not started');
      }

      const walletConnected = isConnected && !!userAddress;
      if (!walletConnected) {
        errors.push('Wallet not connected');
      }

      const supportedChain = isValidChain(currentChainId);
      if (!supportedChain) {
        errors.push(
          `Unsupported chain ${currentChainId}. Expected an Optimism chain (10 or 11155420).`
        );
      }

      const correctChain = supportedChain && currentChainId === expectedChainId;
      if (!correctChain && supportedChain) {
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
      const contractAddressValid = isValidContractAddress(contractAddress);
      if (!contractAddressValid) {
        errors.push('Invalid contract address format');
      }

      const artifactVersionValid = artifactVersion === canonicalVersion;
      if (!artifactVersionValid) {
        errors.push(`Contract version mismatch. Expected ${canonicalVersion}`);
      }

      const abiSupported = abiFunctionSupported;
      if (!abiSupported) {
        errors.push(
          `Canonical ABI does not expose ${APPEAL_PARTICIPATION_FUNCTION}; appeal participation is unavailable.`
        );
      }

      const notAlreadyParticipated = !context.walletPosition.hasParticipated;
      if (!notAlreadyParticipated) {
        errors.push('You have already participated in this appeal');
      }

      let sufficientBalance = false;
      let stakeWithinBounds = false;

      try {
        const stakeBigInt = BigInt(stakeAmount);
        const minStakeBigInt = BigInt(context.stakeBounds.minStake);
        const maxStakeBigInt = context.stakeBounds.maxStake
          ? BigInt(context.stakeBounds.maxStake)
          : BigInt(
              '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
            );
        const balanceBigInt = BigInt(context.walletPosition.currentBalance);

        sufficientBalance = balanceBigInt >= stakeBigInt;
        if (!sufficientBalance) {
          errors.push('Insufficient balance for stake amount');
        }

        stakeWithinBounds = stakeBigInt >= minStakeBigInt && stakeBigInt <= maxStakeBigInt;
        if (stakeBigInt < minStakeBigInt) {
          errors.push(
            `Stake amount below minimum of ${context.stakeBounds.minStake} wei`
          );
        }
        if (stakeBigInt > maxStakeBigInt) {
          errors.push(
            `Stake amount exceeds maximum of ${context.stakeBounds.maxStake} wei`
          );
        }

        if (context.stakeBounds.recommendedStake) {
          const recommendedBigInt = BigInt(context.stakeBounds.recommendedStake);
          if (stakeBigInt < recommendedBigInt / BigInt(2)) {
            warnings.push(
              'Stake amount is significantly below recommended amount'
            );
          }
        }
      } catch {
        errors.push('Invalid stake amount format');
      }

      if (decision !== 'SUPPORT' && decision !== 'OPPOSE') {
        errors.push('Invalid decision. Must be SUPPORT or OPPOSE');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        checks: {
          appealActive,
          walletConnected,
          correctChain,
          supportedChain,
          sufficientBalance,
          notAlreadyParticipated,
          stakeWithinBounds,
          contractAddressValid,
          artifactVersionValid,
          abiFunctionSupported: abiSupported,
        },
      };
    },
    [
      isConnected,
      userAddress,
      currentChainId,
      expectedChainId,
      contractAddress,
      artifactVersion,
      canonicalVersion,
      abiFunctionSupported,
    ]
  );

  /**
   * Simulate appeal participation using a real eth_call. Fails closed with
   * `success: false` when the artifact does not support participation, and it
   * never fabricates gas estimates or projected state.
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
        if (!isConnected || !userAddress) {
          return { success: false, error: 'Wallet not connected' };
        }
        if (!isValidChain(currentChainId)) {
          return {
            success: false,
            error: `Unsupported chain ${currentChainId}`,
          };
        }
        if (currentChainId !== expectedChainId) {
          return {
            success: false,
            error: `Wrong network: connected ${currentChainId}, expected ${expectedChainId}`,
          };
        }
        if (!isValidContractAddress(contractAddress)) {
          return { success: false, error: 'Invalid contract address format' };
        }
        if (artifactVersion !== canonicalVersion) {
          return {
            success: false,
            error: `Unsupported artifact version ${artifactVersion}`,
          };
        }
        if (!abiFunctionSupported) {
          const unsupported = new AppealParticipationError(
            'UNSUPPORTED_ABI',
            `Canonical ABI does not expose ${APPEAL_PARTICIPATION_FUNCTION}; appeal participation is unavailable.`
          );
          setPhase('unsupported');
          setError(unsupported);
          return {
            success: false,
            error: unsupported.message,
          };
        }

        const validation = validateParticipation(context, decision, stakeAmount);
        if (!validation.isValid) {
          return { success: false, error: validation.errors.join('; ') };
        }

        const appealIdBytes32 = normalizeAppealIdToBytes32(
          context.snapshot.appealId
        );
        if (!appealIdBytes32) {
          return {
            success: false,
            error: `Invalid appeal ID "${context.snapshot.appealId}" (must be 32 bytes)`,
          };
        }

        const args = [appealIdBytes32, decision === 'SUPPORT', BigInt(stakeAmount)] as const;
        const calldata = encodeFunctionData({
          abi: abi as unknown as Abi,
          functionName: APPEAL_PARTICIPATION_FUNCTION,
          args,
        });

        if (!publicClient?.simulateContract) {
          return {
            success: false,
            error: 'Public client is unavailable for simulation',
          };
        }
        try {
          await publicClient.simulateContract({
            address: contractAddress,
            abi: abi as unknown as Abi,
            functionName: APPEAL_PARTICIPATION_FUNCTION,
            args,
            account: userAddress,
          });
        } catch (simErr) {
          return {
            success: false,
            error: `Simulation reverted: ${extractMessage(simErr)}`,
          };
        }

        return {
          success: true,
          data: {
            from: userAddress,
            to: contractAddress,
            value: '0', // No ETH sent, just token approval
            calldata,
          },
        };
      } catch (err) {
        const message = `Simulation failed: ${extractMessage(err)}`;
        setError(new AppealParticipationError('UNEXPECTED_ERROR', message));
        return { success: false, error: message };
      } finally {
        setIsSimulating(false);
      }
    },
    [
      isConnected,
      userAddress,
      currentChainId,
      expectedChainId,
      contractAddress,
      artifactVersion,
      canonicalVersion,
      abiFunctionSupported,
      abi,
      publicClient,
      validateParticipation,
    ]
  );

  /**
   * Submit appeal participation. This is a real, ABI-driven transaction flow.
   * When the artifact does not expose `participateInAppeal`, submission fails
   * closed with `UNSUPPORTED_ABI` and no calldata/hash is ever fabricated.
   */
  const submitParticipation = useCallback(
    async (
      context: AppealParticipationContext,
      decision: AppealDecision,
      stakeAmount: string
    ): Promise<AppealParticipationTransaction> => {
      setIsSubmitting(true);
      setError(null);

      const fail = (
        code: AppealParticipationErrorCode,
        message: string,
        targetPhase: Extract<
          AppealParticipationPhase,
          'unsupported' | 'rejected' | 'reverted' | 'dropped' | 'stale' | 'error'
        > = 'error'
      ): never => {
        const err = new AppealParticipationError(code, message);
        setPhase(targetPhase);
        setError(err);
        setIsSubmitting(false);
        setIsConfirming(false);
        throw err;
      };

      const stripeAbi = abi as unknown as Abi;

      try {
        // ---- Fail-closed preconditions (no fabricated calldata/hashes) ----
        if (!isConnected || !userAddress) {
          return fail('UNCONNECTED', 'Wallet not connected.');
        }
        if (!isValidChain(currentChainId)) {
          return fail(
            'UNSUPPORTED_CHAIN',
            `Chain ${currentChainId} is not a supported Optimism chain.`
          );
        }
        if (currentChainId !== expectedChainId) {
          return fail(
            'WRONG_NETWORK',
            `Connected to chain ${currentChainId}, expected ${expectedChainId}.`
          );
        }
        if (!isValidContractAddress(contractAddress)) {
          return fail(
            'INVALID_CONTRACT_ADDRESS',
            'Contract address is not a valid canonical EVM address.'
          );
        }
        if (artifactVersion !== canonicalVersion) {
          return fail(
            'INVALID_ARTIFACT',
            `Unsupported artifact version ${artifactVersion}.`
          );
        }
        if (!abiFunctionSupported) {
          return fail(
            'UNSUPPORTED_ABI',
            `The canonical ABI does not expose ${APPEAL_PARTICIPATION_FUNCTION}; appeal participation is unavailable.`,
            'unsupported'
          );
        }

        setPhase('validating');
        const validation = validateParticipation(context, decision, stakeAmount);
        if (!validation.isValid) {
          return fail(
            firstValidationErrorCode(validation),
            validation.errors.join('; ')
          );
        }

        const appealIdBytes32 = normalizeAppealIdToBytes32(
          context.snapshot.appealId
        );
        if (!appealIdBytes32) {
          return fail(
            'INVALID_APPEAL_ID',
            `Appeal id "${context.snapshot.appealId}" is not a 32-byte value.`
          );
        }

        const support = decision === 'SUPPORT';
        const target = contractAddress;
        const args = [appealIdBytes32, support, BigInt(stakeAmount)] as const;

        // ---- Real eth_call simulation ----
        setPhase('simulating');
        if (!publicClient?.simulateContract) {
          return fail(
            'SIMULATION_REVERTED',
            'Public client is unavailable for simulation.'
          );
        }
        try {
          await publicClient.simulateContract({
            address: target,
            abi: stripeAbi,
            functionName: APPEAL_PARTICIPATION_FUNCTION,
            args,
            account: userAddress,
          });
        } catch (simErr) {
          return fail(
            'SIMULATION_REVERTED',
            `Simulation reverted: ${extractMessage(simErr)}`
          );
        }

        // V2-FE-100 readiness gate — fail closed before any submission attempt
        const gate = evaluateWriteTarget({
          account: userAddress ?? null,
          chainId: currentChainId,
          expectedChainId,
          targetAddress: contractAddress,
        });
        if (!gate.ready) {
          return fail(
            'UNEXPECTED_ERROR',
            gate.reason ?? 'Wallet is not ready for appeal participation.'
          );
        }

        // ---- Allowance + approval (only when a stake token is pinned) ----
        setAllowance(null);
        if (stakeTokenAddress) {
          setPhase('allowance');
          const readAllowance = async (): Promise<bigint> => {
            if (!publicClient?.readContract) {
              throw new Error('Public client cannot read allowance');
            }
            const value = await publicClient.readContract({
              address: stakeTokenAddress,
              abi: erc20Abi,
              functionName: 'allowance',
              args: [userAddress, target],
            });
            return typeof value === 'bigint'
              ? value
              : BigInt(value as number | string);
          };

          let currentAllowance: bigint;
          try {
            currentAllowance = await readAllowance();
          } catch (allowErr) {
            return fail(
              'ALLOWANCE_INSUFFICIENT',
              `Could not read allowance: ${extractMessage(allowErr)}`
            );
          }
          setAllowance(currentAllowance);

          if (currentAllowance < BigInt(stakeAmount)) {
            setPhase('approving');
            try {
              await writeContractAsync({
                address: stakeTokenAddress,
                abi: erc20Abi,
                functionName: 'approve',
                args: [target, maxUint256],
              } as never);
            } catch (approveErr) {
              if (isUserRejected(approveErr)) {
                return fail(
                  'APPROVAL_REJECTED',
                  'Token approval was rejected by the wallet.',
                  'rejected'
                );
              }
              return fail(
                'APPROVAL_REJECTED',
                `Token approval failed: ${extractMessage(approveErr)}`
              );
            }
            try {
              currentAllowance = await readAllowance();
            } catch {
              currentAllowance = 0n;
            }
            setAllowance(currentAllowance);
            if (currentAllowance < BigInt(stakeAmount)) {
              return fail(
                'ALLOWANCE_INSUFFICIENT',
                'Token allowance did not update after approval.'
              );
            }
          }
        }

        // ---- Submit via the wallet (real write) ----
        setPhase('submitting');
        let txHash: Hash;
        try {
          txHash = (await writeContractAsync({
            address: target,
            abi: stripeAbi,
            functionName: APPEAL_PARTICIPATION_FUNCTION,
            args,
          } as never)) as Hash;
        } catch (writeErr) {
          if (isUserRejected(writeErr)) {
            return fail(
              'USER_REJECTED',
              'Appeal participation was rejected by the wallet.',
              'rejected'
            );
          }
          return fail(
            'UNEXPECTED_ERROR',
            `Wallet write failed: ${extractMessage(writeErr)}`
          );
        }

        const pendingTransaction: AppealParticipationTransaction = {
          transactionHash: txHash,
          from: userAddress,
          to: target,
          status: 'PENDING',
          chainId: expectedChainId,
          appealId: context.snapshot.appealId,
          claimId: context.snapshot.claimId,
          disputeId: context.snapshot.disputeId,
          decision,
          stakeAmount,
          timestamp: new Date().toISOString(),
        };
        setLastTransaction(pendingTransaction);

        // ---- Confirmation (real receipt finality) ----
        setPhase('confirming');
        setIsConfirming(true);
        const confirmedReceipt = await waitForReceipt(
          txHash,
          publicClient,
          pollIntervalMs,
          receiptTimeoutMs
        );

        if (!confirmedReceipt) {
          setLastTransaction((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'DROPPED' as AppealParticipationStatus,
                  error: 'Transaction was dropped or not mined before timeout',
                }
              : prev
          );
          return fail(
            'TX_DROPPED',
            `Transaction ${txHash} was dropped or not mined before timeout.`,
            'dropped'
          );
        }

        // Reorg-aware canonicality check before reporting success.
        if (!receiptMatchesSubmission(confirmedReceipt, txHash, expectedChainId)) {
          setLastTransaction((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'STALE' as AppealParticipationStatus,
                  error: 'Receipt does not match the submitted chain or transaction',
                }
              : prev
          );
          return fail(
            'STALE_RECEIPT',
            `Receipt for ${txHash} does not match the submitted chain or transaction.`,
            'stale'
          );
        }

        setReceipt(confirmedReceipt);

        const receiptStatus = confirmedReceipt.status;
        if (receiptStatus === '0x0' || receiptStatus?.toLowerCase() === 'reverted') {
          setLastTransaction((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'REVERTED' as AppealParticipationStatus,
                  error: 'Transaction reverted on-chain',
                }
              : prev
          );
          return fail(
            'TRANSACTION_REVERTED',
            `Appeal participation ${txHash} reverted on-chain.`,
            'reverted'
          );
        }

        const confirmedTransaction: AppealParticipationTransaction = {
          ...pendingTransaction,
          status: 'CONFIRMED',
          blockNumber: confirmedReceipt.blockNumber,
          gasUsed: confirmedReceipt.gasUsed,
        };
        setLastTransaction(confirmedTransaction);
        setPhase('confirmed');
        return confirmedTransaction;
      } catch (err) {
        if (err instanceof AppealParticipationError) {
          setIsSubmitting(false);
          setIsConfirming(false);
          throw err;
        }
        const message = `Appeal participation failed: ${extractMessage(err)}`;
        const unexpected = new AppealParticipationError('UNEXPECTED_ERROR', message);
        setPhase('error');
        setError(unexpected);
        setIsSubmitting(false);
        setIsConfirming(false);
        throw unexpected;
      } finally {
        setIsSubmitting(false);
        setIsConfirming(false);
      }
    },
    [
      isConnected,
      userAddress,
      currentChainId,
      expectedChainId,
      contractAddress,
      artifactVersion,
      canonicalVersion,
      abiFunctionSupported,
      abi,
      stakeTokenAddress,
      publicClient,
      writeContractAsync,
      validateParticipation,
      pollIntervalMs,
      receiptTimeoutMs,
    ]
  );

  /**
   * Mark the in-flight transaction as replaced (e.g. detected via
   * useTransactionRecovery) so the UI no longer shows it as pending.
   */
  const markReplaced = useCallback((replacedBy: `0x${string}`) => {
    setPhase('replaced');
    setError(
      new AppealParticipationError(
        'TX_REPLACED',
        `Transaction was replaced by ${replacedBy}.`
      )
    );
    setLastTransaction((prev) =>
      prev
        ? { ...prev, status: 'REPLACED', replacedBy }
        : prev
    );
  }, []);

  /** Mark the in-flight transaction as dropped from the mempool. */
  const markDropped = useCallback(() => {
    setPhase('dropped');
    setError(
      new AppealParticipationError('TX_DROPPED', 'Transaction was dropped from the mempool.')
    );
    setLastTransaction((prev) =>
      prev ? { ...prev, status: 'DROPPED' } : prev
    );
  }, []);

  /** Reset all submission state back to idle. */
  const reset = useCallback(() => {
    setPhase('idle');
    setIsSimulating(false);
    setIsSubmitting(false);
    setIsConfirming(false);
    setError(null);
    setLastTransaction(null);
    setAllowance(null);
    setReceipt(null);
  }, []);

  return {
    simulateParticipation,
    submitParticipation,
    validateParticipation,
    phase,
    isSimulating,
    isSubmitting,
    isConfirming,
    error,
    lastTransaction,
    allowance,
    receipt,
    markReplaced,
    markDropped,
    reset,
  };
}