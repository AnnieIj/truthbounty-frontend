/**
 * V2-FE-130 — Frontend performance budget configuration.
 *
 * Single typed view over `performance-budgets.json` (the canonical artifact).
 * Used by:
 *  - `scripts/verify-performance-budgets.mjs` (build-time enforcement, raw JS KiB)
 *  - `src/lib/performance/*` (runtime web-vitals classification)
 *
 * Security/architecture invariants:
 *  - Budgets are bound (positive, finite); a missing/unknown route is NULL —
 *    callers must FAIL CLOSED (treat as unknown, never fabricate a pass).
 *  - No telemetry, secrets, or network calls are introduced here.
 */

import budgetsJson from './performance-budgets.json';

export type PerformanceMetricName =
  | 'LCP'
  | 'CLS'
  | 'INP'
  | 'TTFB'
  | 'FCP'
  | 'TBT';

export interface RouteBudget {
  readonly route: string;
  readonly firstLoadJsKiB: number;
}

export interface WebVitalsBudget {
  readonly lcpMs: number;
  readonly cls: number;
  readonly inpMs: number;
  readonly ttfbMs: number;
  readonly fcpMs: number;
  readonly tbtMs: number;
}

export interface PerformanceBudgetConfig {
  readonly schemaVersion: number;
  readonly unit: 'KiB';
  readonly routes: readonly RouteBudget[];
  readonly global: { readonly totalClientJsKiB: number };
  readonly webVitals: WebVitalsBudget;
  readonly stalenessMs: number;
}

export interface VitalThreshold {
  readonly name: PerformanceMetricName;
  readonly limit: number;
  readonly unit: string;
}

/**
 * Loader for the canonical budget artifact. The literal union is recovered
 * with a cast because JSON imports widen `unit` to `string`; the artifact's
 * schema itself is validated at build time by
 * `scripts/verify-performance-budgets.mjs`.
 */
export const PERFORMANCE_BUDGET_CONFIG: PerformanceBudgetConfig = budgetsJson as unknown as PerformanceBudgetConfig;

export function getWebVitalsBudget(): WebVitalsBudget {
  return PERFORMANCE_BUDGET_CONFIG.webVitals;
}

/** Canonical per-metric thresholds used by runtime classification. */
export function getVitalThresholds(): readonly VitalThreshold[] {
  const v = getWebVitalsBudget();
  return [
    { name: 'LCP', limit: v.lcpMs, unit: 'ms' },
    { name: 'CLS', limit: v.cls, unit: '' },
    { name: 'INP', limit: v.inpMs, unit: 'ms' },
    { name: 'TTFB', limit: v.ttfbMs, unit: 'ms' },
    { name: 'FCP', limit: v.fcpMs, unit: 'ms' },
    { name: 'TBT', limit: v.tbtMs, unit: 'ms' },
  ];
}

export function getStalenessMs(): number {
  return PERFORMANCE_BUDGET_CONFIG.stalenessMs;
}

/**
 * Match a concrete window pathname (e.g. `/claims/abc`) to a budgeted route
 * template (e.g. `/claims/[id]`). Only bracket segments are treated as dynamic.
 * Returns `null` when no budget is configured for the route — never guesses.
 */
export function matchRouteBudget(pathname: string): RouteBudget | null {
  if (!pathname || !pathname.startsWith('/')) return null;

  const normalized = pathname.replace(/\/+$/, '') || '/';

  for (const budget of PERFORMANCE_BUDGET_CONFIG.routes) {
    if (routeMatches(normalized, budget.route)) return budget;
  }
  return null;
}

export function routeMatches(pathname: string, route: string): boolean {
  if (!pathname || !route) return false;
  if (route === pathname) return true;
  const pathSegments = pathname.split('/').filter(Boolean);
  const routeSegments = route.split('/').filter(Boolean);
  if (pathSegments.length !== routeSegments.length) return false;
  return routeSegments.every((seg, i) => {
    if (seg.startsWith('[') && seg.endsWith(']')) return true;
    return seg === pathSegments[i];
  });
}

const KIB = 1024;

/** Classify a route's measured first-load JS (raw bytes) against its budget. */
export function classifyRouteBytes(
  bytes: number,
  budget: RouteBudget,
): 'within-budget' | 'over-budget' {
  if (!Number.isFinite(bytes) || !Number.isFinite(budget.firstLoadJsKiB)) {
    throw new Error('classifyRouteBytes requires finite numbers');
  }
  return bytes / KIB <= budget.firstLoadJsKiB ? 'within-budget' : 'over-budget';
}

/**
 * Classify a set of measured web vitals against the canonical thresholds.
 * FAILS CLOSED: with no metrics at all the result is `unknown`, never
 * `within-budget`. Partial metric sets are classified only by measured metrics.
 */
export interface WebVitalsClassification {
  readonly status: 'within-budget' | 'over-budget' | 'unknown';
  readonly violations: ReadonlyArray<{
    readonly name: PerformanceMetricName;
    readonly value: number;
    readonly budget: number;
  }>;
}

export function classifyWebVitals(
  metrics: Partial<Record<PerformanceMetricName, number>>,
  budgets: WebVitalsBudget = getWebVitalsBudget(),
): WebVitalsClassification {
  const entries = Object.entries(metrics) as Array<[PerformanceMetricName, number]>;
  if (entries.length === 0) {
    return { status: 'unknown', violations: [] };
  }

  const violations: Array<{
    name: PerformanceMetricName;
    value: number;
    budget: number;
  }> = [];
  for (const [name, value] of entries) {
    if (!Number.isFinite(value)) continue;
    const limit = thresholdFor(name, budgets);
    if (limit === null) continue;
    if (value > limit) {
      violations.push({ name, value, budget: limit });
    }
  }

  return {
    status: violations.length > 0 ? 'over-budget' : 'within-budget',
    violations,
  };
}

function thresholdFor(
  name: PerformanceMetricName,
  budgets: WebVitalsBudget,
): number | null {
  switch (name) {
    case 'LCP':
      return budgets.lcpMs;
    case 'CLS':
      return budgets.cls;
    case 'INP':
      return budgets.inpMs;
    case 'TTFB':
      return budgets.ttfbMs;
    case 'FCP':
      return budgets.fcpMs;
    case 'TBT':
      return budgets.tbtMs;
    default: {
      const _exhaustive: never = name;
      return _exhaustive as unknown as null;
    }
  }
}

export { KIB };