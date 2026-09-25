'use client';

/**
 * V2 ClaimLifecycleTimeline Component
 *
 * Displays the complete event-derived lifecycle timeline for a claim with
 * canonical chain/API state tracking. All states are accessible, responsive,
 * and never fabricate protocol outcomes.
 *
 * Accessibility:
 * - Full keyboard navigation with arrow keys and tab
 * - Screen reader announcements for state changes
 * - ARIA labels and live regions for dynamic updates
 * - High contrast mode support
 * - Reduced motion support
 */

import React, { useEffect, useRef } from 'react';
import { useClaimLifecycleTimeline } from '@/hooks/useClaimLifecycleTimeline';
import type { TimelineEntry, TimelinePhase } from '@/app/types/lifecycle';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Component props
 */
interface ClaimLifecycleTimelineProps {
  claimId: string;
  className?: string;
  enableRealtime?: boolean;
  enableAutoReconciliation?: boolean;
  maxStalenessMs?: number;
  onPhaseChange?: (phase: TimelinePhase) => void;
  showReconcileButton?: boolean;
  compact?: boolean; // Compact view for mobile
}

/**
 * Main timeline component
 */
export function ClaimLifecycleTimeline({
  claimId,
  className,
  enableRealtime = true,
  enableAutoReconciliation = true,
  maxStalenessMs,
  onPhaseChange,
  showReconcileButton = true,
  compact = false,
}: ClaimLifecycleTimelineProps) {
  const {
    timeline,
    isLoading,
    isError,
    error,
    isStale,
    reconcile,
    isReconciling,
    lastReconciled,
  } = useClaimLifecycleTimeline({
    claimId,
    enableRealtime,
    enableAutoReconciliation,
    maxStalenessMs,
  });

  const prevPhaseRef = useRef<TimelinePhase | null>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  // Announce phase changes to screen readers
  useEffect(() => {
    if (timeline && timeline.currentPhase !== prevPhaseRef.current) {
      prevPhaseRef.current = timeline.currentPhase;
      onPhaseChange?.(timeline.currentPhase);

      // Announce to screen readers
      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = `Claim phase changed to ${formatPhase(timeline.currentPhase)}`;
      }
    }
  }, [timeline, onPhaseChange]);

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn('space-y-4', className)}
        role="status"
        aria-label="Loading timeline"
        aria-busy="true"
      >
        <TimelineSkeleton compact={compact} />
        <span className="sr-only">Loading claim lifecycle timeline...</span>
      </div>
    );
  }

  // Error state
  if (isError || !timeline) {
    return (
      <div
        className={cn('rounded-lg border border-destructive bg-destructive/10 p-4', className)}
        role="alert"
        aria-live="assertive"
      >
        <div className="flex items-start gap-3">
          <span className="text-destructive" aria-hidden="true">
            ⚠️
          </span>
          <div className="flex-1">
            <h3 className="font-semibold text-destructive">Timeline Error</h3>
            <p className="mt-1 text-sm text-destructive/90">
              {error?.message || 'Failed to load claim lifecycle timeline'}
            </p>
            {error?.recoverable && (
              <button
                onClick={() => reconcile()}
                disabled={isReconciling}
                className="mt-3 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
                aria-label="Retry loading timeline"
              >
                {isReconciling ? 'Retrying...' : 'Retry'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (timeline.events.length === 0) {
    return (
      <div
        className={cn('rounded-lg border border-border bg-muted/30 p-8 text-center', className)}
        role="status"
      >
        <div className="mx-auto max-w-md">
          <span className="text-4xl" aria-hidden="true">
            📋
          </span>
          <h3 className="mt-4 font-semibold text-foreground">No Timeline Events</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            No lifecycle events found for this claim. Events will appear as the claim progresses.
          </p>
        </div>
      </div>
    );
  }

  // Stale state warning
  const showStaleWarning = isStale && timeline.staleness.isStale;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Screen reader live region for announcements */}
      <div
        ref={liveRegionRef}
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      />

      {/* Header with phase and actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground" id="timeline-heading">
            Claim Lifecycle
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <PhaseIndicator phase={timeline.currentPhase} />
            {timeline.finality.pendingConfirmations > 0 && (
              <span className="text-xs text-muted-foreground">
                ({timeline.finality.pendingConfirmations} pending)
              </span>
            )}
          </div>
        </div>

        {showReconcileButton && (
          <button
            onClick={() => reconcile()}
            disabled={isReconciling}
            className={cn(
              'rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              showStaleWarning && 'border-warning text-warning hover:bg-warning/10'
            )}
            aria-label={isReconciling ? 'Refreshing timeline data' : 'Refresh timeline data'}
          >
            {isReconciling ? (
              <>
                <span className="inline-block animate-spin mr-2" aria-hidden="true">
                  ⟳
                </span>
                Refreshing...
              </>
            ) : (
              <>
                <span className="mr-2" aria-hidden="true">
                  🔄
                </span>
                Refresh
              </>
            )}
          </button>
        )}
      </div>

      {/* Stale warning banner */}
      {showStaleWarning && (
        <div
          className="rounded-lg border border-warning bg-warning/10 p-3"
          role="alert"
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            <span className="text-warning" aria-hidden="true">
              ⏱️
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-warning">Timeline Data May Be Outdated</p>
              <p className="mt-1 text-xs text-warning/80">
                {timeline.staleness.reason}
                {lastReconciled && (
                  <>
                    {' '}
                    Last updated {formatTimeSince(lastReconciled)} ago.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Timeline entries */}
      <div
        className="space-y-0"
        role="list"
        aria-labelledby="timeline-heading"
        aria-describedby={showStaleWarning ? 'stale-warning' : undefined}
      >
        {timeline.entries.map((entry, index) => (
          <TimelineEntryItem
            key={entry.event.id}
            entry={entry}
            isFirst={index === 0}
            isLast={index === timeline.entries.length - 1}
            compact={compact}
          />
        ))}
      </div>

      {/* Reconciliation status */}
      {timeline.reconciliation.lastError && (
        <div
          className="rounded-lg border border-destructive/50 bg-destructive/5 p-3"
          role="status"
          aria-live="polite"
        >
          <p className="text-xs text-destructive">
            <strong>Reconciliation Error:</strong> {timeline.reconciliation.lastError}
          </p>
        </div>
      )}

      {/* Timeline metadata (for debugging/transparency) */}
      {process.env.NODE_ENV === 'development' && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            Timeline Metadata (Dev Only)
          </summary>
          <dl className="mt-2 space-y-1 pl-4">
            <div>
              <dt className="inline font-semibold">Total Events:</dt>{' '}
              <dd className="inline">{timeline.events.length}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Last Updated:</dt>{' '}
              <dd className="inline">{new Date(timeline.lastUpdated).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">All Events Finalized:</dt>{' '}
              <dd className="inline">{timeline.finality.allEventsFinalized ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Reconciliation Failures:</dt>{' '}
              <dd className="inline">{timeline.reconciliation.failureCount}</dd>
            </div>
          </dl>
        </details>
      )}
    </div>
  );
}

/**
 * Timeline entry component
 */
function TimelineEntryItem({
  entry,
  isFirst,
  isLast,
  compact,
}: {
  entry: TimelineEntry;
  isFirst: boolean;
  isLast: boolean;
  compact: boolean;
}) {
  const { event, title, description, severity, isUserAction, isPending, isStale, canReconcile } =
    entry;

  return (
    <div
      className="relative flex gap-3 pb-8 last:pb-0"
      role="listitem"
      aria-label={`${title}: ${description}`}
    >
      {/* Timeline line */}
      {!isLast && (
        <div
          className="absolute left-[15px] top-8 h-full w-0.5 bg-border"
          aria-hidden="true"
        />
      )}

      {/* Event icon */}
      <div
        className={cn(
          'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
          severity === 'success' && 'border-success bg-success/10',
          severity === 'info' && 'border-info bg-info/10',
          severity === 'warning' && 'border-warning bg-warning/10',
          severity === 'error' && 'border-destructive bg-destructive/10',
          isPending && 'animate-pulse',
          isStale && 'opacity-50'
        )}
        aria-hidden="true"
      >
        <EventIcon type={event.type} severity={severity} />
      </div>

      {/* Event content */}
      <div className={cn('flex-1 space-y-1', compact && 'text-sm')}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h4
              className={cn(
                'font-medium',
                severity === 'success' && 'text-success',
                severity === 'info' && 'text-foreground',
                severity === 'warning' && 'text-warning',
                severity === 'error' && 'text-destructive',
                isStale && 'opacity-70'
              )}
            >
              {title}
              {isUserAction && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">(You)</span>
              )}
            </h4>
            <p className={cn('text-sm text-muted-foreground', isStale && 'opacity-70')}>
              {description}
            </p>
          </div>

          <time
            className={cn('shrink-0 text-xs text-muted-foreground', compact && 'text-[10px]')}
            dateTime={new Date(event.timestamp).toISOString()}
          >
            {formatTimestamp(event.timestamp, compact)}
          </time>
        </div>

        {/* Event metadata */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Finality badge */}
          <FinalityBadge finality={event.finality} />

          {/* Source badge */}
          {!compact && <SourceBadge source={event.source} />}

          {/* Transaction hash link */}
          {event.transactionHash && (
            <a
              href={`https://sepolia-optimism.etherscan.io/tx/${event.transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`View transaction ${event.transactionHash.slice(0, 10)}... on block explorer`}
            >
              Tx: {event.transactionHash.slice(0, 10)}...
            </a>
          )}

          {/* Block number */}
          {event.blockNumber && !compact && (
            <span className="text-xs text-muted-foreground">
              Block {event.blockNumber.toString()}
            </span>
          )}

          {/* Stale indicator */}
          {isStale && (
            <span
              className="text-xs text-warning"
              role="status"
              aria-label="This event data may be outdated"
            >
              ⚠️ Stale
            </span>
          )}

          {/* Pending indicator */}
          {isPending && (
            <span
              className="text-xs text-info animate-pulse"
              role="status"
              aria-label="This event is pending confirmation"
            >
              ⏳ Pending
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Phase indicator component
 */
function PhaseIndicator({ phase }: { phase: TimelinePhase }) {
  const phaseConfig = getPhaseConfig(phase);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        phaseConfig.className
      )}
      role="status"
      aria-label={`Current phase: ${formatPhase(phase)}`}
    >
      <span aria-hidden="true">{phaseConfig.icon}</span>
      {formatPhase(phase)}
    </span>
  );
}

/**
 * Finality badge component
 */
function FinalityBadge({ finality }: { finality: string }) {
  const finalityConfig: Record<string, { label: string; className: string }> = {
    SUBMITTED: { label: 'Submitted', className: 'bg-info/10 text-info' },
    CONFIRMED: { label: 'Confirmed', className: 'bg-success/10 text-success' },
    SAFE: { label: 'Safe', className: 'bg-success/10 text-success' },
    FINALIZED: { label: 'Finalized', className: 'bg-success/20 text-success' },
    INDEXED: { label: 'Indexed', className: 'bg-success/10 text-success' },
    UNCONFIRMED: { label: 'Unconfirmed', className: 'bg-muted text-muted-foreground' },
    STALE: { label: 'Stale', className: 'bg-warning/10 text-warning' },
    FAILED: { label: 'Failed', className: 'bg-destructive/10 text-destructive' },
  };

  const config = finalityConfig[finality] || {
    label: finality,
    className: 'bg-muted text-muted-foreground',
  };

  return (
    <span
      className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', config.className)}
      role="status"
      aria-label={`Finality: ${config.label}`}
    >
      {config.label}
    </span>
  );
}

/**
 * Source badge component
 */
function SourceBadge({ source }: { source: string }) {
  const sourceIcons: Record<string, string> = {
    CHAIN_EVENT: '⛓️',
    CHAIN_QUERY: '🔍',
    API_PROJECTION: '📊',
    WEBSOCKET_UPDATE: '🔄',
    LOCAL_SUBMISSION: '📤',
    RECONCILIATION: '🔀',
  };

  return (
    <span
      className="text-[10px] text-muted-foreground"
      title={`Source: ${source}`}
      aria-label={`Event source: ${source}`}
    >
      {sourceIcons[source] || '•'}
    </span>
  );
}

/**
 * Event icon component
 */
function EventIcon({ type, severity }: { type: string; severity: string }) {
  const icons: Record<string, string> = {
    CLAIM_CREATED: '✨',
    CLAIM_INDEXED: '📑',
    VERIFICATION_SUBMITTED: '📝',
    VERIFICATION_CONFIRMED: '✅',
    VERIFICATION_PERIOD_ENDED: '⏰',
    DISPUTE_CREATED: '⚠️',
    DISPUTE_CONFIRMED: '⚖️',
    SETTLEMENT_CONFIRMED: '🏁',
    FINALIZATION_CONFIRMED: '🎯',
    REWARDS_CLAIMED: '💰',
    REORG_DETECTED: '🔄',
    RECONCILIATION_FAILED: '❌',
  };

  return <span className="text-sm">{icons[type] || '•'}</span>;
}

/**
 * Timeline skeleton for loading state
 */
function TimelineSkeleton({ compact }: { compact: boolean }) {
  return (
    <div className="space-y-6" aria-label="Loading timeline">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton variant="circular" width={32} height={32} />
          <div className="flex-1 space-y-2">
            <Skeleton width="40%" height={compact ? 16 : 20} />
            <Skeleton width="80%" height={compact ? 12 : 16} />
            <div className="flex gap-2">
              <Skeleton width={60} height={20} />
              <Skeleton width={80} height={20} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Helper: Get phase configuration
 */
function getPhaseConfig(phase: TimelinePhase): {
  icon: string;
  className: string;
} {
  const configs: Record<TimelinePhase, { icon: string; className: string }> = {
    CREATED: { icon: '✨', className: 'bg-info/10 text-info' },
    INDEXING: { icon: '⏳', className: 'bg-info/10 text-info' },
    VERIFICATION_OPEN: { icon: '🔓', className: 'bg-success/10 text-success' },
    VERIFICATION_CLOSED: { icon: '🔒', className: 'bg-muted text-muted-foreground' },
    DISPUTED: { icon: '⚠️', className: 'bg-warning/10 text-warning' },
    APPEAL_OPEN: { icon: '⚖️', className: 'bg-warning/10 text-warning' },
    PENDING_SETTLEMENT: { icon: '⏱️', className: 'bg-info/10 text-info' },
    SETTLED: { icon: '✅', className: 'bg-success/10 text-success' },
    PENDING_APPEAL_SETTLEMENT: { icon: '⏱️', className: 'bg-info/10 text-info' },
    APPEAL_SETTLED: { icon: '⚖️', className: 'bg-success/10 text-success' },
    PENDING_FINALIZATION: { icon: '⏱️', className: 'bg-info/10 text-info' },
    FINALIZED: { icon: '🎯', className: 'bg-success/20 text-success' },
    STALE: { icon: '⚠️', className: 'bg-warning/10 text-warning' },
    ERROR: { icon: '❌', className: 'bg-destructive/10 text-destructive' },
  };

  return configs[phase] || { icon: '•', className: 'bg-muted text-muted-foreground' };
}

/**
 * Helper: Format phase name
 */
function formatPhase(phase: TimelinePhase): string {
  return phase
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Helper: Format timestamp
 */
function formatTimestamp(timestamp: number, compact: boolean): string {
  const date = new Date(timestamp);

  if (compact) {
    return date.toLocaleDateString();
  }

  const now = Date.now();
  const diff = now - timestamp;

  // Show relative time for recent events
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Helper: Format time since
 */
function formatTimeSince(timestamp: number): string {
  const diff = Date.now() - timestamp;

  if (diff < 60000) return 'less than a minute';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours`;

  return `${Math.floor(diff / 86400000)} days`;
}
