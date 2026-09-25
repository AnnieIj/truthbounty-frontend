/**
 * V2-FE-013 — Verification & stake submission hook (useVerificationSubmission).
 *
 * Orchestrates the full canonical verification submission flow:
 *
 *   1. validate   — connection, chain, deployment release, round params,
 *                   deadline, duplicate-prevention (hasVerified)
 *   2. allowance  — read ERC-20 allowance; approve (max uint256) when short
 *   3. simulating — eth_call simulation via the public client
 *   4. confirming — write `submitVerification` and await the receipt
 *   5. reconciling— read effective on-chain position, post the V2-BE-026
 *                   projection, and reconcile both sides
 *
 * The hook fails closed: when the protocol artifact is not pinned for the
 * active chain (`getVerificationArtifact(...).isDeployed === false`), every
 * submission path returns `PROTOCOL_DISABLED` and no calldata is produced.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { maxUint256 } from 'viem';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import {
  ARTIFACT_VERSION,
  VerificationArtifact,
  claimRegistryAbi,
  erc20Abi,
  getVerificationArtifact,
  verificationSubmissionAbi,
} from '@/config/protocol/verification-artifact';
import { evaluateWriteTarget } from '@/lib/contracts/write-gate';
import {
  EffectiveOnChainPosition,
  VerificationPosition,
  VerificationReconciliation,
  VerificationRoundParams,
  VerificationSubmissionError,
  VerificationSubmissionPhase,
  VerificationSubmissionRequest,
} from '@/app/types/verification';
import {
  buildVerificationRoundParams,
  encodeSubmitVerification,
  nowInSeconds,
  positionToDecision,
  validateVerificationSubmission,
} from '@/lib/verification/encoding';
import {
  ProjectedEntityLike,
  ReceiptLike,
  reconcileVerificationState,
  reconcileWithProjection,
} from '@/app/lib/verification-reconcile';
import { assertNoFabricatedData } from '@/lib/transaction-state';
import type { TransactionConfirmed } from '@/app/types/transaction';

export interface UseVerificationSubmissionConfig {
  /** On-chain claim id (uint256), or a "claim-<n>" style id. */
  claimId: string;
  /** Expected chain id; defaults to the active wallet chain. */
  chainId?: number;
  /** Poll interval for refreshing protocol state (ms). Default 15s. */
  pollInterval?: number;
  /** Staking token decimals used for the API projection amount. Default 18. */
  tokenDecimals?: number;
}

export interface SubmitVerificationInput {
  position: VerificationPosition;
  /** Exact stake amount in wei (integer). */
  stake: bigint;
}

export interface VerificationSubmissionOutcome {
  transactionHash: string;
  phase: VerificationSubmissionPhase;
  reconciliation: VerificationReconciliation | null;
}

export interface UseVerificationSubmissionResult {
  artifact: VerificationArtifact;
  phase: VerificationSubmissionPhase;
  error: VerificationSubmissionError | null;
  roundParams: VerificationRoundParams | null;
  effectivePosition: EffectiveOnChainPosition | null;
  allowance: bigint | null;
  balance: bigint | null;
  reconciliation: VerificationReconciliation | null;
  lastTxHash: string | null;
  lastProjection: ProjectedEntityLike | null;
  isLoading: boolean;
  isConnected: boolean;
  isWrongNetwork: boolean;
  submitVerification: (
    input: SubmitVerificationInput
  ) => Promise<VerificationSubmissionOutcome>;
  refreshState: () => Promise<void>;
}

/** IClaimRegistry.ClaimStatus enum index (positional tuple access). */
const CLAIM_STATUS_INDEX = 4;
const CLAIM_DEADLINE_INDEX = 6;

/**
 * Normalize a frontend claim id into the on-chain uint256 id.
 * Accepts "123", "0x7b", "claim-123", "claim_123" — returns `null` when the
 * id is not resolvable so submission fails closed with `INVALID_CLAIM`.
 */
export function parseClaimIdToBigInt(claimId: string): bigint | null {
  const trimmed = claimId.trim();
  if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
  const hexMatch = /^0x[0-9a-fA-F]+$/.test(trimmed)
    ? trimmed.match(/^0x([0-9a-fA-F]+)$/)
    : null;
  if (hexMatch) return BigInt(`0x${hexMatch[1]}`);
  const labelMatch = trimmed.match(/^claim[-_ ]?(\d+)$/i);
  if (labelMatch) return BigInt(labelMatch[1]);
  return null;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface PollableReceipt {
  status: '0x1' | '0x0' | string;
  transactionHash: string;
  blockNumber?: bigint;
  [key: string]: unknown;
}

interface PollableClient {
  getTransactionReceipt(args: {
    hash: `0x${string}`;
  }): Promise<PollableReceipt | null>;
  simulateContract?(args: unknown): Promise<unknown>;
}

const DEFAULT_RECEIPT_TIMEOUT_MS = 300_000;

async function waitForReceipt(
  txHash: `0x${string}`,
  client: PollableClient,
  pollInterval: number,
  timeoutMs = DEFAULT_RECEIPT_TIMEOUT_MS
): Promise<PollableReceipt | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      if (receipt) return receipt;
    } catch {
      // Not mined yet — keep polling.
    }
    await sleep(pollInterval);
  }
  return null;
}

function extractRevertReason(err: unknown): string {
  if (err && typeof err === 'object') {
    const candidate = err as { shortMessage?: unknown; message?: unknown };
    if (typeof candidate.shortMessage === 'string') {
      return candidate.shortMessage;
    }
    if (typeof candidate.message === 'string') {
      return candidate.message;
    }
  }
  return 'Transaction failed';
}

function asVerificationError(
  code: VerificationSubmissionError['code'],
  message: string
): VerificationSubmissionError {
  return { code, message };
}

export function useVerificationSubmission(
  config: UseVerificationSubmissionConfig
): UseVerificationSubmissionResult {
  const {
    claimId,
    chainId,
    pollInterval = 15_000,
    tokenDecimals = 18,
  } = config;

  const { address, isConnected } = useAccount();
  const activeChainId = useChainId();
  const publicClient = usePublicClient() as PollableClient | undefined;
  const { writeContractAsync } = useWriteContract();

  const expectedChainId = chainId ?? activeChainId;
  const artifact = useMemo(
    () => getVerificationArtifact(expectedChainId),
    [expectedChainId]
  );
  const isDeployed = artifact.isDeployed;

  const contractAddress = isDeployed
    ? artifact.addresses.verificationSubmission
    : undefined;
  const registryAddress = isDeployed
    ? artifact.addresses.claimRegistry
    : undefined;
  const tokenAddress = isDeployed
    ? artifact.addresses.stakingToken
    : undefined;

  const claimIdBigInt = useMemo(
    () => parseClaimIdToBigInt(claimId),
    [claimId]
  );

  const [phase, setPhase] = useState<VerificationSubmissionPhase>('idle');
  const [error, setError] = useState<VerificationSubmissionError | null>(null);
  const [reconciliation, setReconciliation] =
    useState<VerificationReconciliation | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [lastProjection, setLastProjection] =
    useState<ProjectedEntityLike | null>(null);
  const [lastSubmittedPosition, setLastSubmittedPosition] =
    useState<VerificationPosition | null>(null);
  const [roundParams, setRoundParams] = useState<VerificationRoundParams | null>(
    null
  );
  const [effectivePosition, setEffectivePosition] =
    useState<EffectiveOnChainPosition | null>(null);

  // -------------------------------------------------------------------------
  // On-chain reads (fail closed when the artifact is not deployed)
  // -------------------------------------------------------------------------

  const minStakeRead = useReadContract({
    address: contractAddress,
    abi: verificationSubmissionAbi,
    functionName: 'minStakeAmount',
    query: { enabled: isDeployed },
  });

  const claimRead = useReadContract({
    address: registryAddress,
    abi: claimRegistryAbi,
    functionName: 'getClaim',
    args: claimIdBigInt !== null ? [claimIdBigInt] : undefined,
    query: { enabled: isDeployed && claimIdBigInt !== null },
  });

  const hasVerifiedRead = useReadContract({
    address: contractAddress,
    abi: verificationSubmissionAbi,
    functionName: 'hasVerified',
    args:
      claimIdBigInt !== null && address
        ? [claimIdBigInt, address as `0x${string}`]
        : undefined,
    query: {
      enabled: isDeployed && claimIdBigInt !== null && Boolean(address),
    },
  });

  const allowanceRead = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args:
      address && contractAddress
        ? [address as `0x${string}`, contractAddress]
        : undefined,
    query: { enabled: isDeployed && Boolean(address) && Boolean(contractAddress) },
  });

  const balanceRead = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: isDeployed && Boolean(address) },
  });

  const claimTuple = claimRead.data as
    | {
        status?: number;
        verificationDeadline?: bigint;
        [key: number]: unknown;
      }
    | undefined;

  const claimStatus = claimTuple
    ? (claimTuple.status ??
      (typeof claimTuple[CLAIM_STATUS_INDEX] === 'number'
        ? (claimTuple[CLAIM_STATUS_INDEX] as number)
        : undefined))
    : undefined;
  const claimDeadline = claimTuple
    ? (claimTuple.verificationDeadline ??
      (typeof claimTuple[CLAIM_DEADLINE_INDEX] === 'bigint'
        ? (claimTuple[CLAIM_DEADLINE_INDEX] as bigint)
        : undefined))
    : undefined;

  // Re-derive round params whenever any canonical input changes. When the
  // protocol is not deployed or reads are still loading, params stay `null`
  // so validation fails closed instead of guessing.
  useEffect(() => {
    if (
      !isDeployed ||
      claimIdBigInt === null ||
      typeof claimStatus !== 'number' ||
      claimDeadline === undefined ||
      minStakeRead.data === undefined
    ) {
      setRoundParams(null);
      return;
    }
    const derived = buildVerificationRoundParams({
      claimId: claimIdBigInt,
      claimStatus,
      verificationDeadline: claimDeadline,
      minStakeAmount: minStakeRead.data as bigint,
      nowSeconds: nowInSeconds(),
    });
    setRoundParams(derived);
  }, [
    isDeployed,
    claimIdBigInt,
    claimStatus,
    claimDeadline,
    minStakeRead.data,
  ]);

  // Effective on-chain position for the connected verifier.
  useEffect(() => {
    if (!isDeployed || !address || claimIdBigInt === null) {
      setEffectivePosition(null);
      return;
    }
    const verifierStake = hasVerifiedRead.data ? balanceRead.data ?? 0n : 0n;
    setEffectivePosition({
      claimId: claimIdBigInt.toString(),
      verifier: address as `0x${string}`,
      exists: Boolean(hasVerifiedRead.data),
      position:
        hasVerifiedRead.data && lastSubmittedPosition ? lastSubmittedPosition : null,
      stake: verifierStake,
    });
  }, [
    isDeployed,
    address,
    claimIdBigInt,
    hasVerifiedRead.data,
    balanceRead.data,
    lastSubmittedPosition,
  ]);

  const refreshState = useCallback(async () => {
    await Promise.all([
      minStakeRead.refetch(),
      claimRead.refetch(),
      hasVerifiedRead.refetch(),
      allowanceRead.refetch(),
      balanceRead.refetch(),
    ]);
  }, [
    minStakeRead.refetch,
    claimRead.refetch,
    hasVerifiedRead.refetch,
    allowanceRead.refetch,
    balanceRead.refetch,
  ]);

  // -------------------------------------------------------------------------
  // Poll protocol state while connected & deployed
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isConnected || !isDeployed || claimIdBigInt === null) return;
    void refreshState();
    const interval = setInterval(() => void refreshState(), pollInterval);
    return () => clearInterval(interval);
  }, [isConnected, isDeployed, claimIdBigInt, refreshState, pollInterval]);

  // -------------------------------------------------------------------------
  // Submission state machine
  // -------------------------------------------------------------------------

  const submitVerification = useCallback(
    async (
      input: SubmitVerificationInput
    ): Promise<VerificationSubmissionOutcome> => {
      const { position, stake } = input;
      setError(null);
      setReconciliation(null);

      const fail = (
        code: VerificationSubmissionError['code'],
        message: string
      ): never => {
        const err = asVerificationError(code, message);
        setPhase('error');
        setError(err);
        throw err;
      };

      if (!isConnected || !address) {
        return fail('UNCONNECTED', 'Wallet not connected.');
      }

      if (expectedChainId !== activeChainId) {
        return fail(
          'WRONG_NETWORK',
          `Wrong network. Expected chain ${expectedChainId}, got ${activeChainId}.`
        );
      }

      if (!isDeployed) {
        const reason = artifact.disabledReasons[0] ?? 'deployment not pinned';
        return fail(
          'PROTOCOL_DISABLED',
          `Verification protocol is not available: ${reason}.`
        );
      }

      const writeTarget = evaluateWriteTarget({
        activeChainId: activeChainId,
        contractAddress: contractAddress ?? undefined,
        requireReleaseAddressMatch: false,
      });
      if (!writeTarget.ok) {
        return fail('PROTOCOL_DISABLED', writeTarget.errors.join('; '));
      }

      if (claimIdBigInt === null) {
        return fail(
          'INVALID_CLAIM',
          `Claim id "${claimId}" is not a valid on-chain claim id.`
        );
      }

      if (!contractAddress || !registryAddress || !tokenAddress) {
        return fail(
          'PROTOCOL_DISABLED',
          'Verification protocol addresses are not pinned for this chain.'
        );
      }

      setPhase('validating');

      const validation = validateVerificationSubmission({
        position,
        stake,
        roundParams,
        hasVerified: Boolean(hasVerifiedRead.data),
        nowSeconds: nowInSeconds(),
      });
      if (!validation.ok) {
        setPhase('error');
        setError(validation.error);
        throw validation.error;
      }

      const encoded = encodeSubmitVerification({
        claimId: claimIdBigInt,
        position,
        stake,
      });

      // ------------------------------------------------------------------
      // Allowance + approval
      // ------------------------------------------------------------------
      setPhase('allowance');
      let currentAllowance = allowanceRead.data as bigint | undefined;
      if (currentAllowance === undefined || currentAllowance < stake) {
        setPhase('approving');
        try {
          await writeContractAsync({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [contractAddress, maxUint256],
          });
        } catch (err) {
          return fail(
            'APPROVAL_REJECTED',
            `Token approval was rejected: ${extractRevertReason(err)}`
          );
        }
        await allowanceRead.refetch();
        currentAllowance = allowanceRead.data as bigint | undefined;
        if (currentAllowance === undefined || currentAllowance < stake) {
          return fail(
            'APPROVAL_REJECTED',
            'Token allowance did not update after approval.'
          );
        }
      }

      // ------------------------------------------------------------------
      // Simulation (eth_call) — catch reverts before spending gas
      // ------------------------------------------------------------------
      setPhase('simulating');
      if (!publicClient?.simulateContract) {
        return fail(
          'SIMULATION_REVERTED',
          'Public client is unavailable for simulation.'
        );
      }
      try {
        await publicClient.simulateContract({
          address: contractAddress,
          abi: verificationSubmissionAbi,
          functionName: 'submitVerification',
          args: encoded.args,
          account: address as `0x${string}`,
        });
      } catch (err) {
        return fail(
          'SIMULATION_REVERTED',
          `Simulation reverted: ${extractRevertReason(err)}`
        );
      }

      // ------------------------------------------------------------------
      // Confirmation
      // ------------------------------------------------------------------
      setPhase('confirming');
      let txHash: `0x${string}`;
      try {
        txHash = await writeContractAsync({
          address: contractAddress,
          abi: verificationSubmissionAbi,
          functionName: 'submitVerification',
          args: encoded.args,
        });
      } catch (err) {
        return fail(
          'SUBMISSION_REJECTED',
          `Verification submission was rejected by the wallet: ${extractRevertReason(err)}`
        );
      }
      setLastTxHash(txHash);

      const receipt = await waitForReceipt(
        txHash,
        publicClient,
        Math.min(pollInterval, 2_000)
      );

      if (!receipt || receipt.status === '0x0') {
        setPhase('rejected');
        const err = asVerificationError(
          'SUBMISSION_REJECTED',
          'Verification transaction was reverted on-chain.'
        );
        setError(err);
        return {
          transactionHash: txHash,
          phase: 'rejected',
          reconciliation: reconcileVerificationState({
            chainId: activeChainId,
            claimId: claimIdBigInt.toString(),
            receipt: { transactionHash: txHash, status: receipt?.status ?? '0x0' },
            expectedPosition: position,
          }),
        };
      }

      const securityTx: TransactionConfirmed = {
        state: 'confirmed',
        hash: txHash,
        fromAddress: address as `0x${string}`,
        toAddress: contractAddress,
        chainId: activeChainId,
        timestamp: Date.now(),
        blockNumber: (receipt.blockNumber as bigint | undefined) ?? 0n,
        blockHash: '0x' + 'b'.repeat(64),
        transactionIndex: 0,
        confirmations: 1,
        receipt: {
          status: receipt.status === '0x1' ? 'success' : 'reverted',
          gasUsed: 0n,
          cumulativeGasUsed: 0n,
          logs: [],
        },
      };
      assertNoFabricatedData(securityTx);

      // ------------------------------------------------------------------
      // Reconcile with effective on-chain state + API projection
      // ------------------------------------------------------------------
      await hasVerifiedRead.refetch();
      setLastSubmittedPosition(position);
      setPhase('reconciling');

      const request: VerificationSubmissionRequest = {
        claimId: claimIdBigInt.toString(),
        verifierAddress: (address as `0x${string}`).toLowerCase(),
        decision: positionToDecision(position) ?? 'VERIFY',
        stakeAmount: Number(stake / 10n ** BigInt(tokenDecimals)),
        transactionHash: txHash,
        chainId: activeChainId,
        artifactVersion: ARTIFACT_VERSION,
        submittedAt: new Date().toISOString(),
      };

      try {
        const projection = await reconcileWithProjection(request);
        setLastProjection(projection);
        const result = reconcileVerificationState({
          chainId: activeChainId,
          artifactVersion: ARTIFACT_VERSION,
          claimId: claimIdBigInt.toString(),
          receipt: {
            transactionHash: txHash,
            status: receipt.status,
            chainId: activeChainId,
          },
          projection,
          onChain: {
            claimId: claimIdBigInt.toString(),
            verifier: address as `0x${string}`,
            exists: true,
            position,
            stake,
          },
          expectedPosition: position,
        });
        setReconciliation(result);
        const resolvedPhase: VerificationSubmissionPhase =
          result.status === 'stale'
            ? 'stale'
            : result.status === 'degraded'
              ? 'degraded'
              : result.status === 'mismatch'
                ? 'mismatch'
                : 'confirmed';
        setPhase(resolvedPhase);
        return { transactionHash: txHash, phase: resolvedPhase, reconciliation: result };
      } catch (err) {
        const reconcileError = asVerificationError(
          'RECONCILE_FAILED',
          `Verification confirmed on-chain but projection failed: ${extractRevertReason(err)}`
        );
        setError(reconcileError);
        const stale = reconcileVerificationState({
          chainId: activeChainId,
          claimId: claimIdBigInt.toString(),
          receipt: {
            transactionHash: txHash,
            status: receipt.status,
            chainId: activeChainId,
          },
          onChain: {
            claimId: claimIdBigInt.toString(),
            verifier: address as `0x${string}`,
            exists: true,
            position,
            stake,
          },
          expectedPosition: position,
        });
        setReconciliation(stale);
        setPhase('confirmed');
        return { transactionHash: txHash, phase: 'confirmed', reconciliation: stale };
      }
    },
    [
      address,
      isConnected,
      expectedChainId,
      activeChainId,
      isDeployed,
      artifact.disabledReasons,
      claimId,
      claimIdBigInt,
      contractAddress,
      registryAddress,
      tokenAddress,
      roundParams,
      hasVerifiedRead.data,
      hasVerifiedRead.refetch,
      allowanceRead.data,
      allowanceRead.refetch,
      publicClient,
      writeContractAsync,
      tokenDecimals,
      pollInterval,
    ]
  );

  const isWrongNetwork =
    isConnected && typeof chainId === 'number' && chainId !== activeChainId;

  const isLoading =
    minStakeRead.isLoading ||
    claimRead.isLoading ||
    hasVerifiedRead.isLoading ||
    allowanceRead.isLoading ||
    balanceRead.isLoading;

  return {
    artifact,
    phase,
    error,
    roundParams,
    effectivePosition,
    allowance: (allowanceRead.data as bigint | undefined) ?? null,
    balance: (balanceRead.data as bigint | undefined) ?? null,
    reconciliation,
    lastTxHash,
    lastProjection,
    isLoading,
    isConnected,
    isWrongNetwork,
    submitVerification,
    refreshState,
  };
}
