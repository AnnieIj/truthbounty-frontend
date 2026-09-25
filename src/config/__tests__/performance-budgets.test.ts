import {
  PERFORMANCE_BUDGET_CONFIG,
  classifyRouteBytes,
  classifyWebVitals,
  getVitalThresholds,
  matchRouteBudget,
  routeMatches,
} from '@/config/performance-budgets';
import budgetsJson from '@/config/performance-budgets.json';

describe('performance-budgets config', () => {
  it('matches the canonical artifact schema (schemaVersion 1)', () => {
    expect(budgetsJson.schemaVersion).toBe(1);
    expect(budgetsJson.unit).toBe('KiB');
    expect(PERFORMANCE_BUDGET_CONFIG.routes.length).toBeGreaterThan(0);
  });

  it('has unique, positive route budgets', () => {
    const routes = PERFORMANCE_BUDGET_CONFIG.routes;
    const names = new Set(routes.map((r) => r.route));
    expect(names.size).toBe(routes.length);
    for (const route of routes) {
      expect(route.firstLoadJsKiB).toBeGreaterThan(0);
      expect(Number.isFinite(route.firstLoadJsKiB)).toBe(true);
    }
  });

  it('has a positive global client JS budget', () => {
    expect(PERFORMANCE_BUDGET_CONFIG.global.totalClientJsKiB).toBeGreaterThan(0);
  });

  it('has finite positive web-vitals thresholds for the canonical set', () => {
    const thresholds = getVitalThresholds();
    expect(thresholds.map((t) => t.name)).toEqual(['LCP', 'CLS', 'INP', 'TTFB', 'FCP', 'TBT']);
    for (const threshold of thresholds) {
      expect(threshold.limit).toBeGreaterThan(0);
      expect(Number.isFinite(threshold.limit)).toBe(true);
    }
  });

  it('matches concrete pathnames to route templates', () => {
    expect(matchRouteBudget('/')?.route).toBe('/');
    expect(matchRouteBudget('/identity')?.route).toBe('/identity');
    expect(matchRouteBudget('/claims/0xabc')?.route).toBe('/claims/[id]');
    expect(matchRouteBudget('/claims/abc/def')).toBeNull();
    expect(matchRouteBudget('/bogus')).toBeNull();
    expect(matchRouteBudget('')).toBeNull();
    expect(matchRouteBudget('identity')).toBeNull();
    expect(matchRouteBudget('/')).not.toBeNull();
  });

  it('routeMatches handles trailing slashes and dynamic segments', () => {
    expect(routeMatches('/', '/')).toBe(true);
    expect(routeMatches('/', '')).toBe(false);
    expect(routeMatches('/claims/1', '/claims/[id]')).toBe(true);
    expect(routeMatches('/claims/1/extra', '/claims/[id]')).toBe(false);
    expect(routeMatches('/identity', '/identity')).toBe(true);
  });

  it('classifyRouteBytes stays within budget at the boundary and breaches above it', () => {
    const budget = { route: '/', firstLoadJsKiB: 100 };
    expect(classifyRouteBytes(100 * 1024, budget)).toBe('within-budget');
    expect(classifyRouteBytes(100 * 1024 + 1, budget)).toBe('over-budget');
    expect(classifyRouteBytes(0, budget)).toBe('within-budget');
  });

  it('classifyRouteBytes fails closed on non-finite input', () => {
    const budget = { route: '/', firstLoadJsKiB: 100 };
    expect(() => classifyRouteBytes(Number.NaN, budget)).toThrow();
    expect(() => classifyRouteBytes(Infinity, budget)).toThrow();
  });
});

describe('classifyWebVitals', () => {
  const budgets = { lcpMs: 2500, cls: 0.1, inpMs: 200, ttfbMs: 800, fcpMs: 1800, tbtMs: 300 };

  it('returns unknown (fail-closed) when no metrics are measured', () => {
    expect(classifyWebVitals({}, budgets)).toEqual({ status: 'unknown', violations: [] });
  });

  it('resolves within-budget when all measured values are under thresholds', () => {
    const result = classifyWebVitals(
      { LCP: 1200, CLS: 0.02, INP: 90, TTFB: 300, FCP: 900, TBT: 120 },
      budgets,
    );
    expect(result.status).toBe('within-budget');
    expect(result.violations).toEqual([]);
  });

  it('resolves over-budget and lists each violation', () => {
    const result = classifyWebVitals({ LCP: 3000, INP: 260, CLS: 0.01 }, budgets);
    expect(result.status).toBe('over-budget');
    expect(result.violations.map((v) => v.name)).toEqual(['LCP', 'INP']);
  });

  it('classifies only measured metrics when the set is partial', () => {
    const result = classifyWebVitals({ TTFB: 900 }, budgets);
    expect(result.status).toBe('over-budget');
    expect(result.violations).toEqual([{ name: 'TTFB', value: 900, budget: 800 }]);
  });

  it('ignores non-finite measured values (never fabricates a reading)', () => {
    const result = classifyWebVitals({ LCP: Number.NaN, CLS: 0.5 }, budgets);
    expect(result.status).toBe('over-budget');
    expect(result.violations).toEqual([{ name: 'CLS', value: 0.5, budget: 0.1 }]);
  });
});