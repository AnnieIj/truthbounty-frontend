'use client';

/**
 * FallbackBoundary — Wraps subtrees and surfaces degraded/stale/error UI.
 * Blocks write actions when chain integrity is uncertain.
 * V2-FE-136
 *
 * Props:
 *  - status: IntegrityStatus from ChainIntegrityState
 *  - reason: Human-readable explanation (shown when degraded/blocked/error)
 *  - children: The subtree to render
 *  - fallback: Optional custom fallback node when status !== 'valid'
 *  - blockActions: When true AND status is blocked/error, render no-action overlay
 */

import type { ReactNode } from 'react';
import type { IntegrityStatus } from '@/lib/rpc-fallback/types';

export interface FallbackBoundaryProps {
  status: IntegrityStatus;
  reason?: string | null;
  children: ReactNode;
  /** Custom fallback rendered INSTEAD of children when status is 'blocked' or 'error'. */
  fallback?: ReactNode;
  /** When true, overlay children with a non-interactive shield when blocked/error. */
  blockActions?: boolean;
}

export function FallbackBoundary({
  status,
  reason,
  children,
  fallback,
  blockActions = true,
}: FallbackBoundaryProps) {
  if (status === 'error' || status === 'blocked') {
    if (fallback) return <>{fallback}</>;

    if (blockActions) {
      return (
        <div
          className="relative"
          data-testid="fallback-boundary-blocked"
        >
          {/* Inert overlay prevents interaction */}
          <div
            aria-hidden="true"
            className="pointer-events-none opacity-40 select-none"
          >
            {children}
          </div>
          <div
            className="absolute inset-0 flex items-center justify-center z-10"
          >
            <IntegrityBlockedBanner status={status} reason={reason} />
          </div>
        </div>
      );
    }
  }

  if (status === 'degraded') {
    return (
      <>
        <DegradedBanner reason={reason} />
        {children}
      </>
    );
  }

  return <>{children}</>;
}

// ── Internal banner components ────────────────────────────────────────────────

function DegradedBanner({ reason }: { reason?: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="fallback-boundary-degraded"
      className="flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300"
    >
      <span aria-hidden="true" className="text-base">⚠</span>
      <span>
        {reason ??
          'One or more data sources are slow or on a fallback provider. Data may be slightly delayed.'}
      </span>
    </div>
  );
}

function IntegrityBlockedBanner({
  status,
  reason,
}: {
  status: IntegrityStatus;
  reason?: string | null;
}) {
  const isError = status === 'error';
  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="fallback-boundary-error"
      className={[
        'rounded-md border px-6 py-4 text-sm max-w-sm w-full text-center shadow-md',
        isError
          ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300'
          : 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-300',
      ].join(' ')}
    >
      <p className="font-semibold mb-1">
        {isError ? 'Integrity error' : 'Action unavailable'}
      </p>
      <p>
        {reason ??
          (isError
            ? 'A protocol integrity error occurred. Actions are disabled.'
            : 'Protocol state is stale or chain mismatch detected. Actions are blocked until data refreshes.')}
      </p>
    </div>
  );
}
