export type Freshness = {
  fetchedAt: string; // ISO
  sourceUpdatedAt?: string; // ISO from the canonical source, if provided
  stale: boolean;
};

export type EligibilityState =
  | { status: "loading" }
  | { status: "disconnected" }
  | { status: "wrong-chain"; expectedChainId: number }
  | { status: "eligible"; authority: string; freshness: Freshness }
  | { status: "ineligible"; reason: string; freshness: Freshness }
  | { status: "unavailable"; retryable: boolean };

export type QueueItemState =
  | "available"
  | "assigned"
  | "in-progress"
  | "submitted-pending-confirmation"
  | "confirmed"
  | "expired"
  | "already-submitted"
  | "unavailable";

export type Phase = "commit" | "reveal" | "closed";

export type QueueItem = {
  id: string;
  title: string;
  deadlineIso: string;
  phase: Phase;
  phaseDeadlineIso: string;
  state: QueueItemState;
  freshness: Freshness;
  /** Only present when the canonical phase permits access. */
  protectedEvidence?: string;
  protectedChoice?: string;
};

export type PanelData<T> =
  | { status: "loading" }
  | { status: "error"; retryable: boolean }
  | { status: "ready"; data: T };

export type RewardSummary = { reputation: string; pendingRewards: string; freshness: Freshness };
export type Outcome = { id: string; title: string; result: string; confirmedAtIso: string };