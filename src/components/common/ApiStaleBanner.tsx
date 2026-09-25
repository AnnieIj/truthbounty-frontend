'use client';

/**
 * ApiStaleBanner — Accessible announcement when API projection data is stale.
 * V2-FE-136
 *
 * Renders nothing when data is fresh.
 * Renders a polite warning when stale.
 * Renders an assertive alert when critical (actions may be blocked).
 */

import type { ApiDataStatus } from '@/lib/rpc-fallback/types';

export interface ApiStaleBannerProps {
  status: ApiDataStatus;
  /** Data age in ms — used to show human-readable duration. */
  dataAgeMs?: number | null;
  /** Called when the user requests a manual reload. */
  onReload?: () => void;
  className?: string;
}

function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)} seconds`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} minutes`;
  return `${Math.round(ms / 3_600_000)} hours`;
}

export function ApiStaleBanner({
  status,
  dataAgeMs,
  onReload,
  className = '',
}: ApiStaleBannerProps) {
  if (status === 'fresh' || status === 'loading') return null;

  const isCritical = status === 'critical' || status === 'unavailable';
  const isError = status === 'error';
  const ageLabel = dataAgeMs != null ? ` (${formatAge(dataAgeMs)} ago)` : '';

  let message: string;
  if (status === 'unavailable') {
    message = 'Protocol data is unavailable. Actions are disabled until data is restored.';
  } else if (status === 'critical') {
    message = `Protocol data is critically stale${ageLabel}. Actions are blocked until data refreshes.`;
  } else if (status === 'error') {
    message = 'Failed to load protocol data. Please retry.';
  } else {
    message = `Protocol data may be slightly outdated${ageLabel}.`;
  }

  return (
    <div
      role={isCritical || isError ? 'alert' : 'status'}
      aria-live={isCritical || isError ? 'assertive' : 'polite'}
      aria-atomic="true"
      data-testid={`api-stale-banner-${status}`}
      className={[
        'flex items-start gap-3 rounded-md border px-4 py-3 text-sm',
        isCritical || isError
          ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300'
          : 'border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300',
        className,
      ].join(' ')}
    >
      <span aria-hidden="true" className="mt-0.5 flex-none text-base">
        {isCritical || isError ? '⛔' : '⚠'}
      </span>
      <div className="flex-1">
        <p>{message}</p>
        {onReload && (
          <button
            type="button"
            onClick={onReload}
            className="mt-1 underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-current rounded"
            aria-label="Reload protocol data"
          >
            Reload now
          </button>
        )}
      </div>
    </div>
  );
}
