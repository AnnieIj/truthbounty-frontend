/**
 * V2-FE-130 — Browser web-vitals measurement boundary.
 *
 * Pure-ish adapter over PerformanceObserver + Navigation Timing. Values are
 * read only from the browser; nothing is synthesized, estimated, or persisted.
 * The observer is injectable so tests can drive deterministic metrics.
 *
 * Measured metrics (canonical set):
 *  - LCP  — largest-contentful-paint entries (last reported entry wins)
 *  - CLS  — cumulative layout shift excluding recent-input shifts
 *  - INP  — worst event interaction duration
 *  - FCP  — first-contentful-paint paint entry
 *  - TTFB — navigation responseStart
 *
 * A single reporter callback receives each metric as it is observed. The
 * caller (hook) owns the observation window and final classification.
 */

import type { PerformanceMetricName } from '@/config/performance-budgets';

export interface PerformanceMetricReport {
  readonly name: PerformanceMetricName;
  readonly value: number;
  readonly measuredAt: number;
}

export type OnPerformanceMetric = (metric: PerformanceMetricReport) => void;

export interface EntryLike {
  readonly entryType?: string;
  readonly startTime?: number;
  readonly duration?: number;
  readonly value?: number;
  readonly hadRecentInput?: boolean;
  readonly name?: string;
}

export interface ObserverEntryList {
  getEntries(): EntryLike[];
}

export interface PerformanceObserverAdapter {
  observe(options: { entryTypes: string[] }): void;
  disconnect(): void;
}

export type PerformanceObserverAdapterCtor = new (
  callback: (list: ObserverEntryList) => void,
) => PerformanceObserverAdapter;

export interface WebVitalsObserverEnvironment {
  readonly performance?: Pick<Performance, 'getEntriesByType' | 'now'>;
  readonly PerformanceObserver?: PerformanceObserverAdapterCtor;
  /** Monotonic now() source, defaults to Date.now(). */
  readonly now?: () => number;
}

export function performanceObserverSupported(
  env: WebVitalsObserverEnvironment = {},
): boolean {
  const ctor = env.PerformanceObserver ?? globalThis.PerformanceObserver;
  return typeof ctor === 'function';
}

/**
 * Create the web-vitals observer. Returns `null` when PerformanceObserver is
 * unavailable (callers FAIL CLOSED by surfacing an unsupported/unknown state).
 */
export function createWebVitalsObserver(
  env: WebVitalsObserverEnvironment = {},
): { start(onReport: OnPerformanceMetric): () => void } | null {
  const ctor = (
    env.PerformanceObserver ?? globalThis.PerformanceObserver
  ) as PerformanceObserverAdapterCtor | undefined;
  const now = env.now ?? (() => Date.now());
  if (typeof ctor !== 'function') return null;

  function observeMetric(
    name: PerformanceMetricName,
    value: number,
    onReport: OnPerformanceMetric,
  ): void {
    if (!Number.isFinite(value)) return;
    onReport({ name, value, measuredAt: now() });
  }

  return {
    start(onReport: OnPerformanceMetric) {
      const cleanups: Array<() => void> = [];

      const lcpObserver = new ctor((list) => {
        const entries = list.getEntries();
        const lcp = entries[entries.length - 1];
        if (lcp?.entryType === 'largest-contentful-paint' && lcp.startTime !== undefined) {
          observeMetric('LCP', lcp.startTime, onReport);
        }
      });

      const clsObserver = new ctor((list) => {
        let cumulativeCls = 0;
        for (const entry of list.getEntries()) {
          if (
            entry.entryType === 'layout-shift' &&
            !entry.hadRecentInput &&
            typeof entry.value === 'number'
          ) {
            cumulativeCls += entry.value;
          }
        }
        if (cumulativeCls > 0) observeMetric('CLS', cumulativeCls, onReport);
      });

      const inpObserver = new ctor((list) => {
        let worst = 0;
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'event' && typeof entry.duration === 'number') {
            worst = Math.max(worst, entry.duration);
          }
        }
        if (worst > 0) observeMetric('INP', worst, onReport);
      });

      for (const [observer, entryTypes] of [
        [lcpObserver, ['largest-contentful-paint']],
        [clsObserver, ['layout-shift']],
        [inpObserver, ['event']],
      ] as Array<[PerformanceObserverAdapter, string[]]>) {
        try {
          observer.observe({ entryTypes });
        } catch {
          // Observation of this metric failed; keep the hook deterministic by
          // skipping it — the reducer still fails closed on the others.
        }
        cleanups.push(() => observer.disconnect());
      }

      // Synchronous paint + navigation metrics (no observer required).
      const perf = env.performance ?? (typeof globalThis.performance === 'object' ? globalThis.performance : undefined);
      if (perf?.getEntriesByType) {
        const paint = perf.getEntriesByType('paint');
        for (const entry of paint) {
          if (entry.name === 'first-contentful-paint' && typeof entry.startTime === 'number') {
            observeMetric('FCP', entry.startTime, onReport);
          }
        }

        const navigation = perf.getEntriesByType('navigation');
        const nav = navigation[navigation.length - 1] as EntryLike | undefined;
        if (nav && typeof nav.startTime === 'number' && typeof (nav as { responseStart?: number }).responseStart === 'number') {
          // responseStart is -1 for cross-origin redirects / unstarted navigations.
          const responseStart = (nav as { responseStart?: number }).responseStart as number;
          if (responseStart > 0) observeMetric('TTFB', responseStart - nav.startTime, onReport);
        }
      }

      return () => {
        for (const cleanup of cleanups) cleanup();
      };
    },
  };
}