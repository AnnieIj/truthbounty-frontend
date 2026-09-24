// src/components/features/api-freshness/ApiFreshnessIndicator.tsx

'use client';

import React, { memo, useMemo } from 'react';
import { useApiFreshness } from '@/app/queries/freshness.queries';
import { formatLag, formatLastUpdate, getFreshnessStatus, FRESHNESS_THRESHOLDS } from '@/app/types/api-freshness';
import { Wifi, AlertTriangle, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface ApiFreshnessIndicatorProps {
  /** Whether to show detailed breakdown */
  showDetails?: boolean;
  /** Compact mode for headers/toolbars */
  compact?: boolean;
  /** Custom className */
  className?: string;
  /** Poll interval override in ms */
  pollInterval?: number;
}

const statusStyles = {
  fresh: 'text-green-500 bg-green-500/10 border-green-500/20',
  stale: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  degraded: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
  critical: 'text-red-500 bg-red-500/10 border-red-500/20',
} as const;

const statusLabels = {
  fresh: 'Fresh',
  stale: 'Stale',
  degraded: 'Degraded',
  critical: 'Critical',
} as const;

const statusIcons = {
  fresh: CheckCircle,
  stale: Loader2,
  degraded: AlertTriangle,
  critical: XCircle,
} as const;

export const ApiFreshnessIndicator = memo(function ApiFreshnessIndicator({
  showDetails = true,
  compact = false,
  className = '',
  pollInterval = 30_000,
}: ApiFreshnessIndicatorProps) {
  const { data, isLoading, error, isFresh, isDegraded, refetch } = useApiFreshness({
    pollInterval,
  });

  const status = useMemo(() => {
    if (isLoading) return 'loading' as const;
    if (error) return 'error' as const;
    if (!data) return 'unknown' as const;
    return getFreshnessStatus(data.freshness.lag);
  }, [data, isLoading, error]);

  const StatusIcon = status === 'loading' ? Loader2 : statusIcons[status] ?? AlertTriangle;
  const statusClass = statusStyles[status] ?? statusStyles.critical;

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 ${className}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`API freshness: ${statusLabels[status] ?? status}`}
      >
        <StatusIcon
          className={`w-4 h-4 ${status === 'loading' ? 'animate-spin' : ''} ${status !== 'loading' && status !== 'unknown' && status !== 'error' ? statusStyles[status].split(' ')[0] : 'text-gray-400'}`}
          aria-hidden="true"
        />
        <span className="text-xs font-mono text-gray-400">
          {data ? formatLag(data.freshness.lag) : '—'}
        </span>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div
        className={`flex items-center gap-3 p-4 bg-[#18181b] rounded-xl border border-[#232329] ${className}`}
        role="status"
        aria-live="polite"
        aria-label="Loading API freshness status"
      >
        <Loader2 className="w-5 h-5 text-amber-500 animate-spin" aria-hidden="true" />
        <div>
          <div className="text-sm font-medium text-white">Loading freshness data...</div>
          <div className="text-xs text-[#a1a1aa]">Checking indexer health and chain sync</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl ${className}`}
        role="alert"
        aria-live="assertive"
        aria-label={`Failed to load API freshness: ${error}`}
      >
        <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-red-400">Failed to load freshness data</div>
          <div className="text-xs text-red-500/80 mt-1 font-mono">{error}</div>
          <button
            onClick={() => refetch()}
            className="mt-2 text-xs text-amber-400 hover:text-amber-300 underline focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-[#18181b] rounded"
            aria-label="Retry fetching freshness data"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className={`flex items-center gap-3 p-4 bg-[#18181b] rounded-xl border border-[#232329] ${className}`}
        role="status"
        aria-label="API freshness data unavailable"
      >
        <AlertTriangle className="w-5 h-5 text-gray-400" aria-hidden="true" />
        <div className="text-sm text-gray-400">No freshness data available</div>
      </div>
    );
  }

  const { freshness, degradedState } = data;
  const lag = freshness.lag;
  const lastUpdate = formatLastUpdate(freshness.lastUpdate);

  return (
    <div
      className={`flex flex-col gap-4 p-4 bg-[#18181b] rounded-xl border ${statusClass} ${className}`}
      role="region"
      aria-label="API Freshness Status"
      aria-live={isDegraded ? 'assertive' : 'polite'}
    >
      {/* Header with status */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StatusIcon
            className={`w-5 h-5 ${status === 'loading' ? 'animate-spin' : ''} ${statusStyles[status].split(' ')[0]}`}
            aria-hidden="true"
          />
          <div>
            <div className="text-sm font-medium text-white">API Freshness</div>
            <div className="text-xs text-[#a1a1aa]">
              {statusLabels[status]} • Updated {lastUpdate}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label="Refresh freshness data"
            aria-disabled={isLoading}
          >
            <Loader2 className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          <span className={`text-xs font-mono px-2 py-0.5 rounded ${statusClass}`}>
            {formatLag(lag)}
          </span>
        </div>
      </div>

      {showDetails && (
        <>
          {/* Main metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" role="list" aria-label="Freshness metrics">
            <MetricCard
              label="Indexed Height"
              value={freshness.indexedHeight.toLocaleString()}
              description="Latest block indexed by API"
              icon={<Wifi className="w-4 h-4 text-blue-400" />}
            />
            <MetricCard
              label="Finalized Height"
              value={freshness.finalizedHeight.toLocaleString()}
              description="Latest finalized block"
              icon={<CheckCircle className="w-4 h-4 text-green-400" />}
            />
            <MetricCard
              label="Chain Head"
              value={freshness.chainHeadHeight.toLocaleString()}
              description="Current chain head"
              icon={<Wifi className="w-4 h-4 text-purple-400" />}
            />
            <MetricCard
              label="Lag"
              value={formatLag(lag)}
              description={`Threshold: ${FRESHNESS_THRESHOLDS.DEGRADED_LAG} blocks`}
              icon={<AlertTriangle className={`w-4 h-4 ${statusStyles[status].split(' ')[0]}`} />}
            />
          </div>

          {/* Dependencies */}
          <div>
            <h4 className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider mb-2">
              Dependency Health
            </h4>
            <div className="flex flex-wrap gap-2" role="list" aria-label="Dependency statuses">
              {freshness.dependencies.map((dep) => (
                <DependencyBadge key={dep.name} dependency={dep} />
              ))}
            </div>
          </div>

          {/* Degradation info */}
          {degradedState.isDegraded && (
            <div
              className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-orange-300">
                    API Degraded: {degradedState.degradationReason?.replace('_', ' ') ?? 'Unknown reason'}
                  </div>
                  {degradedState.affectedDependencies.length > 0 && (
                    <div className="text-xs text-orange-400/80 mt-1">
                      Affected: {degradedState.affectedDependencies.join(', ')}
                    </div>
                  )}
                  {degradedState.lastHealthyUpdate && (
                    <div className="text-xs text-gray-500 mt-1">
                      Last healthy: {formatLastUpdate(degradedState.lastHealthyUpdate)}
                    </div>
                  )}
                  {degradedState.estimatedRecovery && (
                    <div className="text-xs text-amber-400 mt-1">
                      Est. recovery: {formatLastUpdate(degradedState.estimatedRecovery)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="text-xs text-gray-500 border-t border-[#232329] pt-3">
            <p>
              <strong>Note:</strong> This reflects API/indexer health only. It does not indicate on-chain failure or
              protocol issues. On-chain state is authoritative via confirmed receipts.
            </p>
          </div>
        </>
      )}
    </div>
  );
});

ApiFreshnessIndicator.displayName = 'ApiFreshnessIndicator';

/* --- Sub-components --- */

interface MetricCardProps {
  label: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}

function MetricCard({ label, value, description, icon }: MetricCardProps) {
  return (
    <div
      className="p-3 bg-[#0d0d0f] rounded-lg border border-[#232329]"
      role="listitem"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] text-[#a1a1aa] uppercase tracking-wider">{label}</span>
        <span className="text-gray-500" aria-hidden="true">{icon}</span>
      </div>
      <div className="text-lg font-mono font-bold text-white">{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{description}</div>
    </div>
  );
}

interface DependencyBadgeProps {
  dependency: {
    name: string;
    status: 'healthy' | 'degraded' | 'unavailable';
    lastSuccessfulUpdate?: string;
    error?: string;
    latencyMs?: number;
  };
}

function DependencyBadge({ dependency }: DependencyBadgeProps) {
  const statusStyles = {
    healthy: 'bg-green-500/10 text-green-400 border-green-500/20',
    degraded: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    unavailable: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  const statusIcons = {
    healthy: CheckCircle,
    degraded: AlertTriangle,
    unavailable: XCircle,
  };

  const StatusIcon = statusIcons[dependency.status];
  const badgeClass = statusStyles[dependency.status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badgeClass}`}
      role="status"
      aria-label={`${dependency.name}: ${dependency.status}`}
    >
      <StatusIcon className="w-3 h-3" aria-hidden="true" />
      <span className="capitalize">{dependency.name.replace('_', ' ')}</span>
      {dependency.latencyMs && (
        <span className="text-[10px] opacity-70 font-mono">{dependency.latencyMs}ms</span>
      )}
    </span>
  );
}