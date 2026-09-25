'use client';

/**
 * useRewardClaim — V2-FE-060
 *
 * Submits pull claims through wagmi/viem against the frozen release ABI and
 * reconciles outcomes from confirmed receipts.
 *
 * Security invariants:
 *  - Calldata is encoded by wagmi/viem from the release ABI. This module
 *    never hand-authors calldata, selectors, gas, or hashes.
 *  - Fails closed on: missing wallet/session, wrong chain, invalid address,
 *    missing/invalid ABI, or no validated claimable entitlements.
 *  - Lifecycle state advances only on canonical receipts — never on timers
 *    or optimistic client guesses.
 *  - No Stellar/Soroban/Freighter/mock-wallet/simulator dependencies.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
  type UseWaitForTransactionReceiptReturnType,
} from 'wagmi';
import { getAddress, isAddress, type Address } from 'viem';

import type {
  RewardClaimReceiptProjection,
  RewardClaimRequest,
  RewardClaimStatus,
  RewardEntitlement,
} from '@/app/types/rewards';
import {
  getContractAbi,
  getContractAddress,
  getProtocolVersion,
  getReleaseChainId,
} from '@/lib/contracts/registry';
import {
  ERC20_TRANSFER_TOPIC,
  reconcileClaimReceipt,
} from '@/lib/rewards/reconcile-claim';
import {
  trackPendingTransaction,
  clearPendingTransaction,
} from '@/lib/pending-transactions';

/** Reason codes surfaced by `failure.reasonCode`. */
export type RewardClaimFailureReason =
  | 'WALLET_NOT_CONNECTED'
  | 'UNSUPPORTED_CHAIN'
  | 'INVALID_CONTRACT_ADDRESS'
  | 'INVALID_ABI'
  | 'NO_CLAIMABLE_ENTITLEMENTS'
  | 'INVALID_REQUEST'
  | 'ALREADY_IN_PROGRESS'
  | 'USER_REJECTED'
  | 'REVERTED'
  | 'RPC_ERROR';

export interface RewardClaimFailureDetail {
  readonly status: 'reverted' | 'rejected' | 'error';
  readonly reason: string;
  readonly reasonCode: RewardClaimFailureReason;
  /** Present for 'reverted' — the hash of the reverted transaction. */
  readonly transactionHash?: `0x${string}`;
}

export interface UseRewardClaimOptions {
  /** Called once the receipt is confirmed and reconciled. */
  onConfirmed?: (projection: RewardClaimReceiptProjection) => void;
  /** Called on revert, rejection, or terminal error. */
  onFailure?: (failure: RewardClaimFailureDetail) => void;
}

export interface UseRewardClaimResult {
  /**
   * Submit a pull claim. The canonical `claimRewards()` entrypoint pulls all
   * claimable entitlements for the caller; `request.claimIds` must reference
   * validated claimable entitlements and gates submission (fail closed).
   */
  submitClaim: (
    request: RewardClaimRequest,
    entitlements: readonly RewardEntitlement[],
  ) => Promise<void>;
  readonly status: RewardClaimStatus;
  /** Hash of the in-flight claim transaction (null until wagmi returns one). */
  readonly txHash: `0x${string}` | null;
  /** Canonical projection after a confirmed receipt; null until then. */
  readonly projection: RewardClaimReceiptProjection | null;
  readonly failure: RewardClaimFailureDetail | null;
  /** True when wallet, release-chain, or release configuration checks fail. */
  readonly isUnsupported: boolean;
  /** Accessible explanation of the failed precondition, when applicable. */
  readonly unsupportedReason: string | null;
  /** True while the wallet write request is pending. */
  readonly isWritePending: boolean;
  /** Reset to idle for a fresh attempt (recovery). */
  reset: () => void;
}

const BYTES32_PATTERN = /^0x[a-fA-F0-9]{64}$/;

function isUserRejection(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name ?? '';
  const shortMessage =
    (err as { shortMessage?: string } | null)?.shortMessage ?? '';
  const message = err instanceof Error ? err.message : '';
  return (
    /UserRejected/i.test(name) ||
    /user rejected|user denied|rejected the request|action_rejected/i.test(
      `${shortMessage} ${message}`,
    )
  );
}

export function useRewardClaim(
  options: UseRewardClaimOptions = {},
): UseRewardClaimResult {
  const { onConfirmed, onFailure } = options;

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const releaseChainId = getReleaseChainId();
  const protocolVersion = getProtocolVersion();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();

  const [status, setStatus] = useState<RewardClaimStatus>('idle');
  const [failure, setFailure] = useState<RewardClaimFailureDetail | null>(null);
  const [submittedHash, setSubmittedHash] = useState<`0x${string}` | null>(null);
  const [projection, setProjection] =
    useState<RewardClaimReceiptProjection | null>(null);

  const canonicalContract = getContractAddress('TruthBountyWeighted');
  const abi = getContractAbi('TruthBountyWeighted');
  const isCorrectChain = chainId === releaseChainId;

  // Snapshot of what was requested, used to reconcile the eventual receipt.
  const requestedRef = useRef<{
    entitlements: readonly RewardEntitlement[];
    claimer: Address;
  } | null>(null);

  // Precondition state used for fail-closed gating before any mutation.
  const preconditions = useMemo(() => {
    if (!isConnected || !address) {
      return {
        ok: false as const,
        code: 'WALLET_NOT_CONNECTED' as const,
        detail: 'Wallet not connected.',
      };
    }
    if (!isCorrectChain) {
      return {
        ok: false as const,
        code: 'UNSUPPORTED_CHAIN' as const,
        detail: `Connected chain ${String(chainId)} is not the protocol chain ${releaseChainId}.`,
      };
    }
    if (!isAddress(canonicalContract)) {
      return {
        ok: false as const,
        code: 'INVALID_CONTRACT_ADDRESS' as const,
        detail: 'Release contract address failed validation.',
      };
    }
    if (!Array.isArray(abi) || abi.length === 0) {
      return {
        ok: false as const,
        code: 'INVALID_ABI' as const,
        detail: 'Release ABI is missing or empty.',
      };
    }
    if (typeof protocolVersion !== 'string' || protocolVersion.length === 0) {
      return {
        ok: false as const,
        code: 'INVALID_ABI' as const,
        detail: 'Protocol release version is unavailable.',
      };
    }
    return { ok: true as const };
  }, [
    isConnected,
    address,
    isCorrectChain,
    chainId,
    releaseChainId,
    canonicalContract,
    abi,
    protocolVersion,
  ]);

  const failWith = useCallback(
    (
      code: RewardClaimFailureReason,
      detail: string,
      txHash?: `0x${string}`,
    ) => {
      const failureDetail: RewardClaimFailureDetail = {
        status:
          code === 'REVERTED'
            ? 'reverted'
            : code === 'USER_REJECTED'
              ? 'rejected'
              : 'error',
        reason: detail,
        reasonCode: code,
        ...(txHash ? { transactionHash: txHash } : {}),
      };
      setFailure(failureDetail);
      setStatus(failureDetail.status);
      onFailure?.(failureDetail);
    },
    [onFailure],
  );

  const reconcileFromReceipt = useCallback(
    (
      receipt: NonNullable<UseWaitForTransactionReceiptReturnType['data']>,
      requestedEntitlements: readonly RewardEntitlement[],
      claimer: Address,
    ) => {
      const outcome = reconcileClaimReceipt({
        receipt: {
          transactionHash: receipt.transactionHash,
          status: receipt.status,
          blockNumber: receipt.blockNumber,
          chainId: receipt.chainId,
          logs: receipt.logs,
          ...(typeof (receipt as { to?: unknown }).to === 'string'
            ? { to: (receipt as { to: string }).to }
            : {}),
        },
        contractAddress: getAddress(canonicalContract),
        expectedChainId: releaseChainId,
        transferTopic: ERC20_TRANSFER_TOPIC,
        requestedEntitlements,
        recipient: claimer,
      });

      if (outcome.status === 'confirmed') {
        setProjection(outcome.projection);
        setStatus('confirmed');
        clearPendingTransaction(receipt.transactionHash);
        onConfirmed?.(outcome.projection);
        return;
      }
      if (outcome.status === 'reverted') {
        clearPendingTransaction(receipt.transactionHash);
        failWith('REVERTED', outcome.reason, outcome.transactionHash);
        return;
      }
      failWith('RPC_ERROR', outcome.reason, receipt.transactionHash);
    },
    [canonicalContract, releaseChainId, onConfirmed, failWith],
  );

  // Watch the canonical receipt for the submitted hash. Lifecycle state only
  // advances when this receipt arrives — never on a timer or client guess.
  const receiptQuery: UseWaitForTransactionReceiptReturnType =
    useWaitForTransactionReceipt({ hash: submittedHash ?? undefined });

  useEffect(() => {
    const requested = requestedRef.current;
    if (!receiptQuery.data || !requested || status !== 'confirming') return;
    const { entitlements, claimer } = requested;
    requestedRef.current = null;
    reconcileFromReceipt(receiptQuery.data, entitlements, claimer);
  }, [receiptQuery.data, status, reconcileFromReceipt]);

  // Surface receipt-wait failures (dropped/replaced/timeout) without guessing.
  useEffect(() => {
    if (!receiptQuery.error || status !== 'confirming') return;
    const detail =
      receiptQuery.error instanceof Error
        ? receiptQuery.error.message
        : 'Transaction confirmation failed.';
    failWith('RPC_ERROR', detail, submittedHash ?? undefined);
  }, [receiptQuery.error, status, failWith, submittedHash]);

  const submitClaim = useCallback(
    async (
      request: RewardClaimRequest,
      entitlements: readonly RewardEntitlement[],
    ): Promise<void> => {
      if (!preconditions.ok) {
        failWith(preconditions.code, preconditions.detail);
        return;
      }
      const resumable =
        status === 'idle' ||
        status === 'error' ||
        status === 'reverted' ||
        status === 'rejected';
      if (!resumable) {
        failWith('ALREADY_IN_PROGRESS', 'A claim is already in progress.');
        return;
      }
      if (
        request.gas !== undefined &&
        (typeof request.gas !== 'bigint' || request.gas <= 0n)
      ) {
        failWith('INVALID_REQUEST', 'gas must be a positive bigint.');
        return;
      }
      if (!Array.isArray(request.claimIds) || request.claimIds.length === 0) {
        failWith('INVALID_REQUEST', 'At least one claim id is required.');
        return;
      }
      const requestedClaimIds = new Set<string>();
      for (const id of request.claimIds) {
        if (typeof id !== 'string' || !BYTES32_PATTERN.test(id)) {
          failWith('INVALID_REQUEST', 'Claim ids must be bytes32 hex values.');
          return;
        }
        const normalizedId = id.toLowerCase();
        if (requestedClaimIds.has(normalizedId)) {
          failWith('INVALID_REQUEST', 'Claim ids must not be duplicated.');
          return;
        }
        requestedClaimIds.add(normalizedId);
      }
      const claimable = entitlements.filter(
        (entitlement) =>
          entitlement.claimable &&
          requestedClaimIds.has(entitlement.claimId.toLowerCase()),
      );
      if (claimable.length !== requestedClaimIds.size) {
        failWith(
          'NO_CLAIMABLE_ENTITLEMENTS',
          'Every claim id must reference a validated claimable entitlement.',
        );
        return;
      }

      setFailure(null);
      setProjection(null);
      setStatus('preparing');

      try {
        setStatus('signature-requested');
        // Calldata is encoded by wagmi/viem from the frozen release ABI.
        // Gas: viem estimates gas when omitted; an explicit validated bigint
        // from the request is forwarded unchanged. No selectors are authored
        // by hand anywhere in this flow.
        const hash: unknown = await writeContractAsync({
          address: getAddress(canonicalContract),
          abi,
          functionName: 'claimRewards',
          args: [], // claimRewards() takes no arguments in the release ABI.
          chainId: releaseChainId,
          ...(request.gas !== undefined ? { gas: request.gas } : {}),
        } as never);

        // Never fabricate: treat the wallet's value as the only hash source.
        if (typeof hash !== 'string' || !BYTES32_PATTERN.test(hash)) {
          failWith(
            'RPC_ERROR',
            'Wallet returned an invalid transaction hash.',
          );
          return;
        }
        const confirmedHash = hash as `0x${string}`;

        const claimer = getAddress(address as string);
        requestedRef.current = { entitlements: claimable, claimer };
        setSubmittedHash(confirmedHash);
        setStatus('submitted');
        trackPendingTransaction({
          id: confirmedHash,
          kind: 'rewards',
          title: 'Claiming rewards',
          description: `Pull claim for ${claimable.length} entitlement${
            claimable.length === 1 ? '' : 's'
          }.`,
          txHash: confirmedHash,
          chainId: releaseChainId,
          machineState: 'submitted',
        });
        setStatus('confirming');
      } catch (err: unknown) {
        if (isUserRejection(err)) {
          failWith(
            'USER_REJECTED',
            'Transaction was rejected in the wallet.',
          );
          return;
        }
        const detail =
          err instanceof Error ? err.message : 'Claim submission failed.';
        failWith('RPC_ERROR', detail);
      }
    },
    [
      preconditions,
      status,
      failWith,
      writeContractAsync,
      canonicalContract,
      abi,
      address,
      releaseChainId,
    ],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setFailure(null);
    setProjection(null);
    setSubmittedHash(null);
    requestedRef.current = null;
  }, []);

  return {
    submitClaim,
    status,
    txHash: submittedHash,
    projection,
    failure,
    isUnsupported: !preconditions.ok,
    unsupportedReason: preconditions.ok ? null : preconditions.detail,
    isWritePending,
    reset,
  };
}
