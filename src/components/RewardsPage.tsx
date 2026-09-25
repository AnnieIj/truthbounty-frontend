"use client";

import { useCallback, useMemo } from "react";
import { formatUnits } from "viem";

import { REWARD_ALLOCATION_EXPLANATIONS } from "@/app/types/rewards";
import { useRewardClaim } from "@/hooks/useRewardClaim";
import { useRewardEntitlements } from "@/hooks/useRewardEntitlements";
import { useWriteReadiness } from "@/hooks/useWriteReadiness";
import { getTransactionExplorerUrl } from "@/lib/explorer";

export default function RewardsPage() {
  const {
    entitlements,
    isLoading,
    isError,
    error,
    isUnsupported,
    unsupportedReason,
    refetch,
  } = useRewardEntitlements();
  const {
    submitClaim,
    status,
    projection,
    failure,
    isUnsupported: isClaimUnsupported,
    unsupportedReason: claimUnsupportedReason,
    reset,
  } = useRewardClaim({
    onConfirmed: () => void refetch(),
  });

  // V2-FE-100: fail-closed readiness gate for claim writes. The claim target
  // is the canonical release contract, resolved by the gate itself.
  const readiness = useWriteReadiness({ requireCanonicalMatch: true });

  const claimable = useMemo(
    () => entitlements.filter((entitlement) => entitlement.claimable),
    [entitlements],
  );
  const isClaimInProgress =
    status === "preparing" ||
    status === "signature-requested" ||
    status === "submitted" ||
    status === "confirming";
  const unavailableReason = unsupportedReason ?? claimUnsupportedReason;

  const claimAll = useCallback(() => {
    void submitClaim(
      { claimIds: claimable.map((entitlement) => entitlement.claimId) },
      claimable,
    );
  }, [claimable, submitClaim]);

  if (isUnsupported || isClaimUnsupported) {
    return (
      <section aria-label="Claimable rewards">
        <p role="status">
          {unavailableReason ?? "Rewards are unavailable for this wallet or network."}
        </p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section aria-label="Claimable rewards">
        <p role="status" aria-label="Loading claimable rewards">Loading rewards…</p>
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-label="Claimable rewards">
        <p role="alert">{error ?? "Failed to load claimable rewards."}</p>
        <button type="button" onClick={() => void refetch()}>Retry</button>
      </section>
    );
  }

  return (
    <section aria-label="Claimable rewards">
      <h1>Rewards Dashboard</h1>

      {!readiness.isReady && readiness.message && (
        <p data-testid="write-readiness-reason" role="status">
          {readiness.message}
        </p>
      )}

      <button
        type="button"
        onClick={claimAll}
        disabled={
          claimable.length === 0 ||
          isClaimInProgress ||
          status === "confirmed" ||
          !readiness.isReady
        }
        aria-busy={isClaimInProgress}
        aria-label={
          isClaimInProgress
            ? "Claiming rewards"
            : !readiness.isReady
              ? readiness.message || "Claim unavailable"
              : "Claim Rewards"
        }
        aria-describedby={
          !readiness.isReady && readiness.message
            ? "write-readiness-reason"
            : undefined
        }
      >
        {isClaimInProgress ? "Claiming..." : "Claim Rewards"}
      </button>

      {failure && (
        <p role="alert">
          {failure.reason}{" "}
          <button type="button" onClick={reset}>Dismiss</button>
        </p>
      )}

      {projection && (
        <div role="status" aria-live="polite">
          <p>Transaction confirmed.</p>
          <a
            href={getTransactionExplorerUrl(projection.transactionHash)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Explorer
          </a>
          {projection.receivedAssets.length > 0 && (
            <ul aria-label="Assets received">
              {projection.receivedAssets.map((asset) => (
                <li key={asset.asset}>
                  {asset.asset}: {asset.amount.toString()}
                </li>
              ))}
            </ul>
          )}
          {projection.outstandingClaimIds.length > 0 && (
            <p>
              {projection.outstandingClaimIds.length} entitlement{projection.outstandingClaimIds.length === 1 ? " remains" : "s remain"} outstanding.
            </p>
          )}
        </div>
      )}

      <h2>Claimable Rewards</h2>
      {claimable.length === 0 ? (
        <p>No rewards available</p>
      ) : (
        <ul>
          {claimable.map((entitlement) => (
            <li key={entitlement.claimId}>
              {formatUnits(entitlement.amount, entitlement.decimals)} tokens - {REWARD_ALLOCATION_EXPLANATIONS[entitlement.category]}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
