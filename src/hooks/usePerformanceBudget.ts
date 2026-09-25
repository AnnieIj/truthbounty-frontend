'use client';

/**
 * V2-FE-130 — usePerformanceBudget
 *
 * Orchestrates the browser web-vitals boundary and the pure budget state
 * machine. It observes LCP/CLS/INP/FCP/TTFB during a bounded observation
 * window, then FAILS CLOSED: no measurable metrics => `unknown`, never
 * `within-budget`. Unsupported environments become `unsupported`.
 *
 * All timings are injectable (observation window, now source, observer
 * environment) so unit/integration tests are deterministic.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import {
  createIdlePerformanceState,
  isBudgetMeasurementStale,
  transitionPerformanceBudget,
  type PerformanceBudgetStatus,
  type PerformanceBudgetValue,
  type PerformanceViolation,
} from '@/lib/performance/budget-state';
import {
  createWebVitalsObserver,
  performanceObserverSupported,
  type PerformanceObserverAdapterCtor,
  type PerformanceMetricReport,
} from '@/lib/performance/measure';
import { getStalenessMs, matchRouteBudget } from '@/config/performance-budgets';
import type { RouteBudget } from '@/config/performance-budgets';

export interface UsePerformanceBudgetOptions {
  /** Pathname to evaluate; defaults to `window.location.pathname` (client). */
  route?: string;
  /** Length of the collection window in ms. Defaults to 5000. */
  observationWindowMs?: number;
  /** Turn measurement off (state stays idle). Defaults to true. */
  enabled?: boolean;
  /** Inject observer environment (tests / non-browser hosts). */
  environment?: {
    performance?: Pick<Performance, 'getEntriesByType' | 'now'>;
    PerformanceObserver?: PerformanceObserverAdapterCtor;
  };
  /** Override the staleness window. Defaults to the canonical config value. */
  stalenessMs?: number;
  /** Override the clock for deterministic staleness in tests. */
  now?: () => number;
}

export interface UsePerformanceBudgetReturn {
  readonly status: PerformanceBudgetStatus;
  readonly metrics: PerformanceBudgetValue;
  readonly violations: ReadonlyArray<PerformanceViolation>;
  readonly measuredAt: number | null;
  readonly isStale: boolean;
  /** True while the observation window is open. */
  readonly isMonitoring: boolean;
  readonly unsupportedReason: string | null;
  readonly error: string | null;
  /** Matched route budget from the canonical artifact, or null (fails closed). */
  readonly routeBudget: RouteBudget | null;
  readonly isSupported: boolean;
  retry: () => void;
  reset: () => void;
}

const DEFAULT_OBSERVATION_WINDOW_MS = 5000;

export function usePerformanceBudget(
  options: UsePerformanceBudgetOptions = {},
): UsePerformanceBudgetReturn {
  const {
    route,
    observationWindowMs = DEFAULT_OBSERVATION_WINDOW_MS,
    enabled = true,
    environment,
    stalenessMs = getStalenessMs(),
    now,
  } = options;

  const [state, dispatch] = useReducer(
    transitionPerformanceBudget,
    undefined,
    createIdlePerformanceState,
  );

  const [pathname, setPathname] = useState<string | null>(() => {
    if (route) return route;
    return typeof window !== 'undefined' ? window.location.pathname : null;
  });

  const [nowValue, setNowValue] = useState<number>(() => now?.() ?? Date.now());

  const observerCleanupRef = useRef<(() => void) | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest options are mirrored into a ref so `startObservation` stays a stable
  // identity regardless of how callers construct `environment`/`now`. This
  // prevents inline option objects from re-running the observation effect in a
  // render loop while still using the freshest values at call time. The ref is
  // updated in an effect (never during render), which keeps the observation
  // window consistent with the state machine's rendering.
  const optionsRef = useRef({ observationWindowMs, environment, now });

  useEffect(() => {
    optionsRef.current = { observationWindowMs, environment, now };
  }, [observationWindowMs, environment, now]);

  const supported = useMemo(
    () =>
      performanceObserverSupported({
        PerformanceObserver: environment?.PerformanceObserver,
      }),
    [environment?.PerformanceObserver],
  );

  // Reactive clock for staleness (kept cheap; 10s tick in the browser).
  useEffect(() => {
    const timer = setInterval(() => setNowValue(now?.() ?? Date.now()), 10_000);
    return () => clearInterval(timer);
  }, [now]);

  const startObservation = useCallback(() => {
    const { observationWindowMs: windowMs, environment: env, now: nowFn } = optionsRef.current;
    const observer = createWebVitalsObserver({
      performance: env?.performance,
      PerformanceObserver: env?.PerformanceObserver,
      now: nowFn,
    });
    if (!observer) {
      // Fail closed from idle — never enter 'measuring' if measurement is
      // impossible (avoids an illegal measuring + UNSUPPORTED transition).
      dispatch({
        type: 'UNSUPPORTED',
        reason: 'PerformanceObserver is not available in this browser.',
      });
      return;
    }

    dispatch({ type: 'START' });

    const reportMetric = (metric: PerformanceMetricReport): void => {
      dispatch({
        type: 'METRIC',
        name: metric.name,
        value: metric.value,
        measuredAt: metric.measuredAt,
      });
    };

    try {
      const cleanup = observer.start(reportMetric);
      observerCleanupRef.current = cleanup;
      settleTimerRef.current = setTimeout(
        () => dispatch({ type: 'END', endedAt: nowFn?.() ?? Date.now() }),
        windowMs,
      );
    } catch (err) {
      dispatch({
        type: 'ERROR',
        message: err instanceof Error ? err.message : String(err),
        measuredAt: nowFn?.() ?? Date.now(),
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    startObservation();
    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      observerCleanupRef.current?.();
      observerCleanupRef.current = null;
    };
  }, [enabled, startObservation]);

  const retry = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    observerCleanupRef.current?.();
    observerCleanupRef.current = null;
    dispatch({ type: 'RETRY' });
    startObservation();
  }, [startObservation]);

  const reset = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    observerCleanupRef.current?.();
    observerCleanupRef.current = null;
    dispatch({ type: 'RESET' });
  }, []);

  useEffect(() => {
    if (!enabled) {
      reset();
    }
  }, [enabled, reset]);

  const routeBudget = useMemo(() => (pathname ? matchRouteBudget(pathname) : null), [pathname]);

  const isStale = isBudgetMeasurementStale(state, nowValue, stalenessMs);

  return {
    status: state.status,
    metrics: state.metrics,
    violations: state.violations,
    measuredAt: state.measuredAt,
    isStale,
    isMonitoring: state.status === 'measuring',
    unsupportedReason: state.status === 'unsupported' ? state.error : null,
    error: state.status === 'error' ? state.error : null,
    routeBudget,
    isSupported: supported,
    retry,
    reset,
  };
}