import type { EligibilityState, Outcome, PanelData, QueueItem, RewardSummary } from "./types";
import { EligibilityNotice } from "./EligibilityNotice";
import { QueuePanel } from "./QueuePanel";
import { OutcomesPanel, PhasePanel, RewardsPanel } from "./PhaseAndSummaries";

export type VerifierDashboardProps = {
  online: boolean;
  eligibility: EligibilityState;
  available: PanelData<QueueItem[]>;
  commitments: PanelData<QueueItem[]>;
  rewards: PanelData<RewardSummary>;
  outcomes: PanelData<Outcome[]>;
  onRetry?: () => void;
};

export function VerifierDashboard(p: VerifierDashboardProps) {
  const eligible = p.eligibility.status === "eligible";
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Verifier dashboard</h1>

      {!p.online && (
        <div role="alert" className="rounded border p-3">
          You are offline. Showing last known data only; nothing here is confirmed live.
        </div>
      )}

      <EligibilityNotice state={p.eligibility} onRetry={p.onRetry} />

      <QueuePanel
        title="Available verification queue"
        panel={p.available}
        emptyText="No work is available right now."
        eligible={eligible}
        onRetry={p.onRetry}
      />
      <QueuePanel
        title="Assigned and in-progress commitments"
        panel={p.commitments}
        emptyText="You have no assigned commitments."
        eligible={eligible}
        onRetry={p.onRetry}
      />
      <PhasePanel panel={p.commitments} />

      <div className="grid gap-4 md:grid-cols-2">
        <RewardsPanel panel={p.rewards} />
        <OutcomesPanel panel={p.outcomes} />
      </div>
    </main>
  );
}