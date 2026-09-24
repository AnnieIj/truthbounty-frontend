import type { PanelData, QueueItem, QueueItemState } from "./types";
import { formatDeadline, formatFreshness } from "./format";

const LABEL: Record<QueueItemState, string> = {
  available: "Available",
  assigned: "Assigned",
  "in-progress": "In progress",
  "submitted-pending-confirmation": "Submitted, awaiting canonical confirmation",
  confirmed: "Confirmed",
  expired: "Expired",
  "already-submitted": "Already submitted",
  unavailable: "Unavailable",
};

export function QueuePanel({
  title,
  panel,
  emptyText,
  eligible,
  onRetry,
}: {
  title: string;
  panel: PanelData<QueueItem[]>;
  emptyText: string;
  eligible: boolean;
  onRetry?: () => void;
}) {
  const headingId = `queue-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <section aria-labelledby={headingId} className="rounded-lg border p-4">
      <h2 id={headingId} className="text-lg font-semibold">{title}</h2>

      {panel.status === "loading" && <p role="status">Loading…</p>}

      {panel.status === "error" && (
        <div role="alert">
          <p>This panel could not be loaded.</p>
          {panel.retryable && onRetry && (
            <button type="button" onClick={onRetry} className="mt-2 rounded border px-3 py-1 text-sm">Retry</button>
          )}
        </div>
      )}

      {panel.status === "ready" && !eligible && (
        <p>Work is hidden because eligibility is not confirmed.</p>
      )}

      {panel.status === "ready" && eligible && panel.data.length === 0 && <p>{emptyText}</p>}

      {panel.status === "ready" && eligible && panel.data.length > 0 && (
        <ul className="mt-2 space-y-3">
          {[...panel.data]
            .sort((a, b) => new Date(a.deadlineIso).getTime() - new Date(b.deadlineIso).getTime())
            .map((item) => {
              const d = formatDeadline(item.deadlineIso);
              const phaseOpen = item.phase !== "closed";
              return (
                <li key={item.id} className="rounded border p-3">
                  <p className="font-medium">{item.title}</p>
                  <p>
                    Status: <strong>{LABEL[item.state]}</strong>
                  </p>
                  <p>
                    Deadline: <time dateTime={item.deadlineIso}>{d.absolute}</time> ({d.relative})
                  </p>
                  <p className="text-sm">{formatFreshness(item.freshness.fetchedAt, item.freshness.stale)}</p>
                  {item.protectedEvidence !== undefined ? (
                    <p>Evidence: {item.protectedEvidence}</p>
                  ) : (
                    <p>Evidence sealed until the canonical phase permits access.</p>
                  )}
                  {item.protectedChoice !== undefined ? (
                    <p>Your choice: {item.protectedChoice}</p>
                  ) : (
                    <p>Your choice is sealed.</p>
                  )}
                  {!phaseOpen && <p>Phase closed.</p>}
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}