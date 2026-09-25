"use client";

/**
 * useRewards — V2-FE-060
 *
 * V2 reward entitlement and claim flow. Delegates to the canonical hooks:
 *  - useRewardEntitlements: reads finalized claimable balances from the
 *    backend projection (V2-BE-017) and validates them (untrusted input).
 *  - useRewardClaim: submits pull claims via wagmi/viem against the frozen
 *    release ABI and reconciles receipts.
 *
 * The legacy mock-data pipeline (claimableRewards from @/data/mock-data) and
 * the NotImplemented claimRewards stub are removed; this hook no longer
 * fabricates rewards, hashes, or settlement state. Lifecycle state is driven
 * by canonical on-chain receipts only — never by setTimeout or client guesses.
 */

import { useCallback, useMemo } from "react";
import { formatUnits } from "viem";

import {
  REWARD_ALLOCATION_EXPLANATIONS,
  type RewardAllocationCategory,
  type RewardClaimReceiptProjection,
  type RewardEntitlement,
} from "@/app/types/rewards";
import { useRewardEntitlements } from "@/hooks/useRewardEntitlements";
import {
  useRewardClaim,
  type RewardClaimFailureDetail,
} from "@/hooks/useRewardClaim";
import { getTransactionExplorerUrl } from "@/lib/explorer";

export type ClaimStatus =
  | "idle"
  | "loading"
  | "confirming"
  | "success"
  | "error";

export interface RewardLineItem {
  /** bytes32 claim id. */
  claimId: string;
  title: string;
  /** Allocation category with a human-facing explanation. */
  category: RewardAllocationCategory;
  categoryExplanation: string;
  /** Exact decimal string in the asset's smallest unit. */
  amountRaw: string;
  /** Display amount formatted with the asset's validated decimals. */
  amountFormatted: string;
  asset: string;
}

export interface UseRewardsReturn {
  pendingRewards: RewardLineItem[];
  /** Display string of the total claimable, summed exactly per asset. */
  totalClaimableDisplay: string | null;
  status: ClaimStatus;
  lastTxHash: `0x${string}` | null;
  /** Receipt-derived claim outcome, available only after confirmation. */
  receiptProjection: RewardClaimReceiptProjection | null;
  errorMessage: string | null;
  /** True while the finalized entitlement projection is loading. */
  isLoading: boolean;
  /** Entitlement-projection error, separate from claim submission failures. */
  loadError: string | null;
  /** True when wallet, chain, or release prerequisites are unmet. */
  isUnsupported: boolean;
  unsupportedReason: string | null;
  claimAll: () => Promise<void>;
  /** Re-fetch the finalized entitlement projection. */
  refresh: () => Promise<void>;
  /** Reset a terminal failure back to idle (recovery). */
  reset: () => void;
}

export function useRewards(): UseRewardsReturn {
  const entitlementsQuery = useRewardEntitlements();

  const claim = useRewardClaim({
    onConfirmed: () => {
      // Canonical receipt confirmed: refresh the backend projection so the
      // reward list reflects the settled state from V2-BE-017.
      void entitlementsQuery.refetch();
    },
  });

  const lines = useMemo<RewardLineItem[]>(
    () =>
      entitlementsQuery.entitlements
        .filter((e) => e.claimable)
        .map((e) => ({
          claimId: e.claimId,
          // No backend title field exists in the projection; the category
          // explanation is the canonical human-facing description.
          title: REWARD_ALLOCATION_EXPLANATIONS[e.category],
          category: e.category,
          categoryExplanation: REWARD_ALLOCATION_EXPLANATIONS[e.category],
          amountRaw: e.amount.toString(10),
          amountFormatted: formatUnits(e.amount, e.decimals),
          asset: e.asset,
        })),
    [entitlementsQuery.entitlements],
  );

  const totalClaimableDisplay = useMemo(() => {
    const groups = entitlementsQuery.summary.claimableByAsset;
    if (groups.length === 0) return null;
    // Multiple assets are shown as an exact, per-asset exact-sum list.
    return groups
      .map(
        (g) =>
          `${formatUnits(g.totalAmount, g.decimals)} × ${g.asset.slice(0, 6)}…`,
      )
      .join(" + ");
  }, [entitlementsQuery.summary.claimableByAsset]);

  const status: ClaimStatus = useMemo(() => {
    switch (claim.status) {
      case "preparing":
      case "signature-requested":
        return "loading";
      case "submitted":
      case "confirming":
        return "confirming";
      case "confirmed":
        return "success";
      case "reverted":
      case "error":
      case "rejected":
        return "error";
      default:
        return "idle";
    }
  }, [claim.status]);

  const errorMessage =
    claim.failure?.reason ?? entitlementsQuery.error ?? null;

  const claimAll = useCallback(async () => {
    const claimable: RewardEntitlement[] = entitlementsQuery.entitlements.filter(
      (e) => e.claimable,
    );
    if (claimable.length === 0) return;
    await claim.submitClaim(
      { claimIds: claimable.map((e) => e.claimId) },
      entitlementsQuery.entitlements,
    );
  }, [claim, entitlementsQuery.entitlements]);

  const reset = useCallback(() => {
    claim.reset();
  }, [claim]);

  const isUnsupported =
    entitlementsQuery.isUnsupported || claim.isUnsupported;
  const unsupportedReason =
    entitlementsQuery.unsupportedReason ?? claim.unsupportedReason;

  return {
    pendingRewards: lines,
    totalClaimableDisplay,
    status,
    lastTxHash: claim.txHash ?? claim.projection?.transactionHash ?? null,
    receiptProjection: claim.projection,
    errorMessage,
    isLoading: entitlementsQuery.isLoading,
    loadError: entitlementsQuery.error,
    isUnsupported,
    unsupportedReason,
    claimAll,
    refresh: entitlementsQuery.refetch,
    reset,
  };
}
