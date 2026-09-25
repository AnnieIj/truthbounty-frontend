'use client';

/**
 * useRewardsClaim (V2-FE-118)
 *
 * Rewards claim journey wired to the canonical contract registry (address, ABI
 * and release chain id) and the read/projection layer for claimable rows.
 *
 * Guarantees:
 * - Contracts remain authoritative; the API is only a read projection.
 * - Fails closed on a disconnected wallet, unsupported/mismatched chain or an
 *   empty projection (see `computeClaimEligibility`).
 * - Success is derived from a real receipt + canonical chain finality, never
 *   from a timer. Hashes come only from the wallet/provider.
 * - Wallet/RPC error text is classified into a safe message; raw errors are not
 *   surfaced.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useBlockNumber,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import type { Abi } from 'viem';

import { getChainConfig, isSupportedChain } from '@/config/chains';
import {
  getContractAbi,
  getContractAddress,
  getReleaseChainId,
} from '@/lib/contracts/registry';
import {
  classifyClaimError,
  computeClaimEligibility,
  sumClaimable,
  type ClaimEligibility,
  type ClaimableRewardItem,
  type RewardsClaimStatus,
} from '@/lib/rewards-claim';

export interface UseRewardsClaimResult {
  address: string | null;
  rewards: ClaimableRewardItem[];
  totalClaimable: number;
  status: RewardsClaimStatus;
  eligibility: ClaimEligibility;
  txHash: `0x${string}` | null;
  /** Canonical release chain id the claim transaction targets. */
  chainId: number;
  confirmations: number;
  requiredConfirmations: number;
  errorMessage: string | null;
  claim: () => Promise<void>;
  refresh: () => void;
}

interface ReceiptLike {
  status?: 'success' | 'reverted';
  blockNumber?: bigint;
}

export function useRewardsClaim(): UseRewardsClaimResult {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const contractAddress = getContractAddress('TruthBountyWeighted');
  const contractAbi = getContractAbi('TruthBountyWeighted') as Abi;
  const expectedChainId = getReleaseChainId();

  const [rewards, setRewards] = useState<ClaimableRewardItem[]>([]);
  const [status, setStatus] = useState<RewardsClaimStatus>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const { writeContractAsync } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash ?? undefined });
  const { data: currentBlock } = useBlockNumber();
  const receiptData = (receipt?.data ?? null) as ReceiptLike | null;

  // Read the rewards projection. Read layer only — never treated as canonical
  // confirmation of a payout.
  useEffect(() => {
    let active = true;

    async function load() {
      if (!address) {
        if (active) setRewards([]);
        return;
      }
      if (active) setStatus((s) => (s === 'idle' ? 'loading' : s));
      try {
        const res = await fetch(`/api/rewards?user=${address}`);
        if (!res || !res.ok) {
          if (active) setRewards([]);
          return;
        }
        const data = (await res.json()) as unknown;
        const list = Array.isArray(data)
          ? (data as Array<{ id?: string; amount?: number | string; reason?: string }>)
          : [];
        if (!active) return;
        setRewards(
          list.map((row, index) => ({
            id: String(row?.id ?? index),
            amount: row?.amount ?? 0,
            reason: row?.reason,
          })),
        );
      } catch {
        if (active) setRewards([]);
      } finally {
        if (active) setStatus((s) => (s === 'loading' ? 'idle' : s));
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [address, reloadToken]);

  const inProgress =
    status === 'awaitingSignature' ||
    status === 'submitted' ||
    status === 'confirming';

  const eligibility = useMemo(
    () =>
      computeClaimEligibility({
        address,
        isConnected,
        chainId,
        expectedChainId,
        claimableCount: rewards.length,
        inProgress,
      }),
    [address, isConnected, chainId, expectedChainId, rewards.length, inProgress],
  );

  const totalClaimable = useMemo(() => sumClaimable(rewards), [rewards]);

  // Finality threshold from canonical chain config — never from a timer.
  const requiredConfirmations = isSupportedChain(chainId)
    ? getChainConfig(chainId).finalizedBlocks
    : 0;

  const confirmations =
    receiptData?.blockNumber !== undefined && currentBlock !== undefined
      ? Number(currentBlock - receiptData.blockNumber) + 1
      : 0;

  // Derive confirmed/finalized/reverted strictly from the receipt.
  useEffect(() => {
    if (!txHash || !receiptData) return;

    if (receiptData.status === 'reverted') {
      setStatus('reverted');
      setErrorMessage('The claim reverted on-chain. No rewards were transferred.');
      return;
    }

    if (receiptData.status === 'success') {
      const blocks =
        receiptData.blockNumber !== undefined && currentBlock !== undefined
          ? Number(currentBlock - receiptData.blockNumber) + 1
          : 0;
      const finalized =
        requiredConfirmations > 0 && blocks >= requiredConfirmations;
      setStatus(finalized ? 'finalized' : 'confirmed');
      if (finalized) setRewards([]);
    }
  }, [txHash, receiptData, currentBlock, requiredConfirmations]);

  // Reflect receipt waiting without asserting any outcome.
  useEffect(() => {
    if (status === 'submitted' && receipt?.isLoading) {
      setStatus('confirming');
    }
  }, [status, receipt?.isLoading]);

  const claim = useCallback(async () => {
    if (!eligibility.canClaim) return;

    setErrorMessage(null);
    setStatus('awaitingSignature');
    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'claimRewards',
        chainId: expectedChainId,
      });
      setTxHash(hash as `0x${string}`);
      setStatus('submitted');
    } catch (error) {
      const classified = classifyClaimError(error);
      setStatus(classified.status);
      setErrorMessage(classified.message);
    }
  }, [
    eligibility.canClaim,
    writeContractAsync,
    contractAddress,
    contractAbi,
    expectedChainId,
  ]);

  const refresh = useCallback(() => {
    setTxHash(null);
    setErrorMessage(null);
    setStatus('idle');
    setReloadToken((t) => t + 1);
  }, []);

  return {
    address: address ?? null,
    rewards,
    totalClaimable,
    status,
    eligibility,
    txHash,
    chainId: expectedChainId,
    confirmations,
    requiredConfirmations,
    errorMessage,
    claim,
    refresh,
  };
}

export default useRewardsClaim;
