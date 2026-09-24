import type { Outcome, PanelData, QueueItem, RewardSummary } from "./types";
import { formatDeadline, formatFreshness } from "./format";

export function PhasePanel({ panel }: { panel: PanelData<QueueItem[]> }) {
  return (
    <section aria-labelledby="phase-heading" className="rounded-lg border p-4">
      <h2 id="phase-heading" className="text-lg font-semibold">Phase and deadlines</h2>
      {panel.status === "loading" && <p role="status">Loading…</p>}
      {panel.status === "error" && <p role="alert">Phase information is unavailable.</p>}
      {panel.status === "ready" && panel.data.length === 0 && <p>No active phases.</p>}
      {panel.status === "ready" && panel.data.length > 0 && (
        <ul className="space-y-2">
          {panel.data.map((i) => {
            const d = formatDeadline(i.phaseDeadlineIso);
            return (
              <li key={i.id}>
                {i.title}: <strong>{i.phase}</strong> phase ends{" "}
                <time dateTime={i.phaseDeadlineIso}>{d.absolute}</time> ({d.relative})
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function RewardsPanel({ panel }: { panel: PanelData<RewardSummary> }) {
  return (
    <section aria-labelledby="rewards-heading" className="rounded-lg border p-4">
      <h2 id="rewards-heading" className="text-lg font-semibold">Rewards and reputation</h2>
      {panel.status === "loading" && <p role="status">Loading…</p>}
      {panel.status === "error" && <p role="alert">Summary unavailable.</p>}
      {panel.status === "ready" && (
        <dl>
          <dt>Reputation</dt>
          <dd>{panel.data.reputation}</dd>
          <dt>Pending rewards</dt>
          <dd>{panel.data.pendingRewards}</dd>
          <dd className="text-sm">{formatFreshness(panel.data.freshness.fetchedAt, panel.data.freshness.stale)}</dd>
        </dl>
      )}
    </section>
  );
}

export function OutcomesPanel({ panel }: { panel: PanelData<Outcome[]> }) {
  return (
    <section aria-labelledby="outcomes-heading" className="rounded-lg border p-4">
      <h2 id="outcomes-heading" className="text-lg font-semibold">Recent verification outcomes</h2>
      {panel.status === "loading" && <p role="status">Loading…</p>}
      {panel.status === "error" && <p role="alert">Outcomes unavailable.</p>}
      {panel.status === "ready" && panel.data.length === 0 && <p>No confirmed outcomes yet.</p>}
      {panel.status === "ready" && panel.data.length > 0 && (
        <ul className="space-y-2">
          {panel.data.map((o) => (
            <li key={o.id}>
              {o.title}: {o.result} (confirmed <time dateTime={o.confirmedAtIso}>{new Date(o.confirmedAtIso).toUTCString()}</time>)
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}