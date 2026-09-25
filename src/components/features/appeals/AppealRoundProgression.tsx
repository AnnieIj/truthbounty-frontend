/**
 * V2-FE-059 — Accessible appeal round / bond / deadline progression panel.
 *
 * Displays canonical round progression (round number, required bond, deadline,
 * support/oppose totals). Does not invent protocol state — callers must pass
 * values from on-chain reads / useAppealContext.
 */

'use client';

import type { AppealRoundProgressionView } from '@/app/types/appeal';
import {
  formatBondWei,
  formatDeadline,
} from '@/lib/appeal/round-progression';

export interface AppealRoundProgressionProps {
  progression: AppealRoundProgressionView | null;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export function AppealRoundProgression({
  progression,
  isLoading = false,
  error = null,
  onRefresh,
}: AppealRoundProgressionProps) {
  if (isLoading) {
    return (
      <section
        aria-busy="true"
        aria-live="polite"
        className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"
      >
        <p className="text-sm text-zinc-400">Loading appeal round…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section
        role="alert"
        aria-live="assertive"
        className="rounded-xl border border-red-900/60 bg-red-950/20 p-4"
      >
        <h3 className="text-sm font-semibold text-red-300">
          Appeal round unavailable
        </h3>
        <p className="mt-1 text-sm text-red-200/90">{error}</p>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="mt-3 rounded-lg border border-red-800 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/40"
          >
            Retry
          </button>
        ) : null}
      </section>
    );
  }

  if (!progression) {
    return (
      <section
        aria-live="polite"
        className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"
      >
        <p className="text-sm text-zinc-400">
          No appeal round data. Connect on a supported Optimism network with a
          pinned appeal artifact to load round, bond, and deadline.
        </p>
      </section>
    );
  }

  const stale = !progression.roundMatchesExpected;

  return (
    <section
      aria-labelledby="appeal-round-heading"
      className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3
          id="appeal-round-heading"
          className="text-sm font-semibold text-white sm:text-base"
        >
          Appeal round progression
        </h3>
        <span
          className={`text-xs font-mono ${
            progression.isActive ? 'text-emerald-400' : 'text-zinc-400'
          }`}
        >
          {progression.state}
        </span>
      </div>

      {stale ? (
        <p
          role="status"
          className="mb-3 rounded-lg border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-sm text-amber-200"
        >
          Round advanced on-chain (expected {progression.expectedRound}, live{' '}
          {progression.roundNumber}). Refresh before participating — stale-round
          writes are blocked.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-zinc-500">Round</dt>
          <dd className="font-mono text-white">{progression.roundNumber}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Required bond</dt>
          <dd className="font-mono text-white">
            {formatBondWei(progression.requiredBond)} tokens
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Deadline</dt>
          <dd className="font-mono text-white">
            <time dateTime={new Date(progression.deadlineSeconds * 1000).toISOString()}>
              {formatDeadline(progression.timeRemainingSeconds)}
            </time>
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Support / Oppose</dt>
          <dd className="font-mono text-white">
            {formatBondWei(progression.supportStake)} /{' '}
            {formatBondWei(progression.opposeStake)}
          </dd>
        </div>
      </dl>

      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          className="mt-4 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900"
        >
          Refresh round
        </button>
      ) : null}
    </section>
  );
}
