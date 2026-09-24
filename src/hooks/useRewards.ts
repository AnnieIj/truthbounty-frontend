"use client";

/**
 * useRewards — V2 update (V2-FE-009)
 *
 * Updated to:
 *  - Pass v2 PendingTransactionEntry fields (txHash, chainId, machineState)
 *    to trackPendingTransaction.
 *  - claimRewards from wallet.ts now throws NotImplemented pending V2-FE-003.
 *    This hook gracefully surfaces that error to the user as an `error` state.
 *  - lastTxHash is typed as `0x${string} | null` to match V2 integrity rules
 *    (no string-typed fake hash).
 */

import { useState, useCallback } from "react";
import { claimRewards } from "@/app/lib/wallet";
import {
  clearPendingTransaction,
  trackPendingTransaction,
} from '@/lib/pending-transactions';

export type ClaimStatus = "idle" | "loading" | "success" | "error";

/** Reward entitlement sourced from the rewards API / indexer — never fixtures. */
export interface ClaimableReward {
  claimId: string;
  title: string;
  amount: number;
  claimedAt?: string;
}

export interface UseRewardsReturn {
  pendingRewards: ClaimableReward[];
  totalClaimable: number;
  status: ClaimStatus;
  lastTxHash: `0x${string}` | null;
  errorMessage: string | null;
  claimAll: () => Promise<void>;
}

export function useRewards(): UseRewardsReturn {
  // V2-FE-044: start empty — production must not seed rewards from mock fixtures.
  // Entitlements are loaded from the canonical rewards API when available (V2-FE-003).
  const [pendingRewards, setPendingRewards] =
    useState<ClaimableReward[]>([]);
  const [status, setStatus] = useState<ClaimStatus>("idle");
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const totalClaimable = pendingRewards.reduce((sum, r) => sum + r.amount, 0);

  const claimAll = useCallback(async () => {
    if (pendingRewards.length === 0 || status === "loading") return;

    const ids = pendingRewards.map((r) => r.claimId);
    const transactionId = `rewards:${ids.join(',')}`;

    setStatus("loading");
    setErrorMessage(null);

    // Track in pending-tx registry with v2 fields
    trackPendingTransaction({
      id: transactionId,
      kind: 'rewards',
      title: 'Rewards claim pending',
      description: `Claiming ${ids.length} reward${ids.length === 1 ? '' : 's'} from your dashboard.`,
      txHash: null,       // not yet submitted
      chainId: null,      // not yet known
      machineState: 'idle',
    });

    try {
      const { txHash } = await claimRewards(ids);
      clearPendingTransaction(transactionId);
      setLastTxHash(txHash);
      setPendingRewards([]);
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err: unknown) {
      clearPendingTransaction(transactionId);
      const message =
        err instanceof Error ? err.message : "Claim failed. Please try again.";
      setErrorMessage(message);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  }, [pendingRewards, status]);

  return {
    pendingRewards,
    totalClaimable,
    status,
    lastTxHash,
    errorMessage,
    claimAll,
  };
}
