'use client';

/**
 * V2-FE-130 — PerformanceBudgetIndicator
 *
 * Transparent, accessible status for frontend performance budgets. It never
 * fabricates results: values come from the browser web-vitals boundary and are
 * classified against the canonical `performance-budgets.json` artifact.
 *
 * Accessibility:
 *  - Announces status changes via an `aria-live="polite"` region.
 *  - The trigger is a real <button> (keyboard operable) toggling a details
 *    panel that is not rendered otherwise (no focusable hidden content).
 *  - Color is never the only signal: every state has text + an icon.
 *  - Respects `prefers-reduced-motion`: the measuring state uses a static
 *    pulse-free dot; no animation is applied when reduced motion is preferred.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  RefreshCw,
  XCircle,
} from 'lucide-react';

import { usePerformanceBudget } from '@/hooks/usePerformanceBudget';
import type { PerformanceBudgetStatus } from '@/lib/performance/budget-state';
import type { PerformanceMetricName } from '@/config/performance-budgets';

export interface PerformanceBudgetIndicatorProps {
  /** Pathname to match against route budgets. Defaults to current path. */
  route?: string;
  /** Show the textual label next to the icon. */
  showLabel?: boolean;
  className?: string;
}

export const PERFORMANCE_METRIC_UNITS: Record<PerformanceMetricName, string> = {
  LCP: 'ms',
  CLS: '',
  INP: 'ms',
  TTFB: 'ms',
  FCP: 'ms',
  TBT: 'ms',
};

const STATUS_LABELS: Record<PerformanceBudgetStatus, string> = {
  idle: 'Performance budget: not started',
  measuring: 'Measuring performance…',
  'within-budget': 'Performance within budget',
  'over-budget': 'Performance over budget',
  unknown: 'Performance budget: could not measure',
  error: 'Performance budget: measurement error',
  unsupported: 'Performance budget: not supported in this browser',
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    // Absent media query support (SSR/tests): be conservative and reduce motion.
    return true;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PerformanceBudgetIndicator({
  route,
  showLabel = true,
  className = '',
}: PerformanceBudgetIndicatorProps) {
  const budget = usePerformanceBudget({ route });
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => prefersReducedMotion());
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent): void => setReducedMotion(event.matches);
    setReducedMotion(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const { status, metrics, violations, isStale, isMonitoring, routeBudget, retry } = budget;

  const label = STATUS_LABELS[status];

  const statusTone = useMemo(() => {
    switch (status) {
      case 'within-budget':
        return 'text-emerald-700 dark:text-emerald-400';
      case 'over-budget':
        return 'text-red-700 dark:text-red-400';
      case 'measuring':
      case 'unknown':
      case 'idle':
        return 'text-amber-700 dark:text-amber-400';
      case 'error':
      case 'unsupported':
        return 'text-gray-600 dark:text-gray-400';
      default: {
        const _exhaustive: never = status;
        return _exhaustive as string;
      }
    }
  }, [status]);

  const StatusIcon = useMemo(() => {
    switch (status) {
      case 'within-budget':
        return CheckCircle2;
      case 'over-budget':
        return AlertTriangle;
      case 'measuring':
      case 'idle':
        return Clock;
      case 'unknown':
        return Gauge;
      case 'error':
      case 'unsupported':
        return XCircle;
      default: {
        const _exhaustive: never = status;
        return _exhaustive as typeof Gauge;
      }
    }
  }, [status]);

  const measuredEntries = useMemo(
    () =>
      Object.entries(metrics)
        .map(([name, value]) => ({
          name: name as PerformanceMetricName,
          value: value as number,
          unit: PERFORMANCE_METRIC_UNITS[name as PerformanceMetricName],
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [metrics],
  );

  const iconClassName = reducedMotion || !isMonitoring ? '' : 'animate-spin';

  return (
    <div
      className={`relative flex items-center gap-2 ${className}`}
      data-testid="performance-budget-indicator"
    >
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="performance-budget-announcement"
      >
        {label}
        {status === 'over-budget'
          ? ` ${violations.length} measurement(s) exceed the budget.`
          : isStale
            ? ' Measurement is stale.'
            : ''}
      </span>

      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={detailsOpen}
        aria-controls="performance-budget-details"
        aria-label={label}
        onClick={() => setDetailsOpen((open) => !open)}
      >
        <StatusIcon className={`h-4 w-4 ${statusTone} ${iconClassName}`} aria-hidden="true" />
        {showLabel && (
          <span className={statusTone}>
            {status === 'over-budget' ? 'Perf: over budget' : status === 'within-budget' ? 'Perf: ok' : 'Perf: measuring'}
          </span>
        )}
        {isStale && status !== 'measuring' && (
          <span className={`inline-flex items-center gap-1 ${statusTone}`}>
            <Clock className="h-3 w-3" aria-hidden="true" /> stale
          </span>
        )}
      </button>

      {detailsOpen && (
        <section
          id="performance-budget-details"
          aria-label="Performance budget details"
          className="absolute right-0 top-8 z-50 w-80 rounded-lg border border-border bg-card p-4 text-sm shadow-lg"
          data-testid="performance-budget-details"
        >
          <p className="font-semibold text-foreground">{label}</p>
          {routeBudget ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Route budget ({routeBudget.route}): {routeBudget.firstLoadJsKiB} KiB first-load JS
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              No first-load JS budget is configured for this route.
            </p>
          )}

          {status === 'measuring' && (
            <p className="mt-2 text-xs text-muted-foreground">
              Collecting real-user metrics (LCP, CLS, INP, FCP, TTFB)…
            </p>
          )}

          {violations.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-border pt-3">
              {violations.map((violation) => (
                <li key={violation.name} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    {violation.name}
                    <span className="text-muted-foreground"> exceeded</span>
                  </span>
                  <span className="text-red-700 dark:text-red-400">
                    {violation.value.toFixed(2)} {PERFORMANCE_METRIC_UNITS[violation.name]} /{' '}
                    {violation.budget.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {measuredEntries.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-border pt-3">
              {measuredEntries.map((entry) => (
                <li
                  key={entry.name}
                  className="flex items-center justify-between text-xs text-muted-foreground"
                >
                  <span>{entry.name}</span>
                  <span className="font-medium text-foreground">
                    {entry.value.toFixed(2)} {entry.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {(status === 'error' || status === 'unsupported' || status === 'unknown') && (
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              {budget.error ?? 'This measurement could not be completed. No result is shown.'}
            </p>
          )}

          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={retry}
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" /> Re-measure
          </button>
        </section>
      )}
    </div>
  );
}