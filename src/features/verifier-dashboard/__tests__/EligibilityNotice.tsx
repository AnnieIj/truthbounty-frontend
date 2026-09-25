import type { EligibilityState } from "./types";
import { formatFreshness } from "./format";

export function EligibilityNotice({ state, onRetry }: { state: EligibilityState; onRetry?: () => void }) {
  let title = "";
  let body = "";
  let role: "status" | "alert" = "status";

  switch (state.status) {
    case "loading":
      title = "Checking eligibility";
      body = "Waiting for the canonical eligibility source.";
      break;
    case "disconnected":
      title = "Wallet not connected";
      body = "Connect a wallet to see your eligibility.";
      break;
    case "wrong-chain":
      title = "Wrong network";
      body = `Switch to chain ${state.expectedChainId} to see eligible work.`;
      role = "alert";
      break;
    case "eligible":
      title = "Eligible to verify";
      body = `Source: ${state.authority}. ${formatFreshness(state.freshness.fetchedAt, state.freshness.stale)}.`;
      break;
    case "ineligible":
      title = "Not eligible";
      body = `Reason: ${state.reason}. ${formatFreshness(state.freshness.fetchedAt, state.freshness.stale)}.`;
      role = "alert";
      break;
    case "unavailable":
      title = "Eligibility unavailable";
      body = "The canonical source could not be reached. No eligibility is assumed.";
      role = "alert";
      break;
  }

  return (
    <section aria-labelledby="eligibility-heading" role={role} className="rounded-lg border p-4">
      <h2 id="eligibility-heading" className="text-lg font-semibold">{title}</h2>
      <p className="text-sm">{body}</p>
      {state.status === "unavailable" && state.retryable && onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 rounded border px-3 py-1 text-sm">
          Retry
        </button>
      )}
    </section>
  );
}