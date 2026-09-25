"use client";
import { useCallback, useEffect, useState } from "react";
import { VerifierDashboard } from "./VerifierDashboard";
import { useWalletReconciliation } from "./useWalletReconciliation";
import type { EligibilityState, Outcome, PanelData, QueueItem, RewardSummary } from "./types";

// WIRE 1: import the repo's real canonical hooks/clients here, e.g.
// import { useVerifierEligibility } from "@/hooks/...";
// import { getVerifierQueue, getVerifierRewards, getVerifierOutcomes } from "@/lib/...";

export function VerifierDashboardContainer() {
  const [online, setOnline] = useState(true);
  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const [eligibility, setEligibility] = useState<EligibilityState>({ status: "loading" });
  const [available, setAvailable] = useState<PanelData<QueueItem[]>>({ status: "loading" });
  const [commitments, setCommitments] = useState<PanelData<QueueItem[]>>({ status: "loading" });
  const [rewards, setRewards] = useState<PanelData<RewardSummary>>({ status: "loading" });
  const [outcomes, setOutcomes] = useState<PanelData<Outcome[]>>({ status: "loading" });

  // Account/chain change: drop protected work and refetch canonical eligibility.
  useWalletReconciliation(() => {
    setAvailable({ status: "loading" });
    setCommitments({ status: "loading" });
    setRewards({ status: "loading" });
    setOutcomes({ status: "loading" });
    setEligibility({ status: "loading" });
    refetch();
  });

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // WIRE 2: eligibility from the canonical source. Map its result to EligibilityState:
      // disconnected | wrong-chain | eligible(authority, freshness) | ineligible(reason, freshness) | unavailable
      // const result = await <canonical eligibility call>;
      // if (!cancelled) setEligibility(mapped);

      // WIRE 3: only fetch queue/commitments when eligibility is "eligible".
      // Each panel gets its own try/catch so one failure never blanks the page:
      // try { const q = await <queue call>; if (!cancelled) setAvailable({ status: "ready", data: q.available });
      //       if (!cancelled) setCommitments({ status: "ready", data: q.commitments }); }
      // catch { if (!cancelled) { setAvailable({ status: "error", retryable: true }); setCommitments({ status: "error", retryable: true }); } }
      // Repeat the same pattern for rewards and outcomes.
      // Never include protectedEvidence/protectedChoice unless the canonical phase permits it.
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return (
    <VerifierDashboard
      online={online}
      eligibility={eligibility}
      available={available}
      commitments={commitments}
      rewards={rewards}
      outcomes={outcomes}
      onRetry={refetch}
    />
  );
}