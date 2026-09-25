import { renderHook, act } from '@testing-library/react';
import { usePerformanceBudget } from '../usePerformanceBudget';
import type { ObserverEntryList, PerformanceObserverAdapter } from '@/lib/performance/measure';

class MockObserver implements PerformanceObserverAdapter {
  static instances: MockObserver[] = [];
  callback: (list: ObserverEntryList) => void;
  observed: string[][] = [];
  disconnected = false;

  constructor(callback: (list: ObserverEntryList) => void) {
    this.callback = callback;
    MockObserver.instances.push(this);
  }

  observe(options: { entryTypes: string[] }): void {
    this.observed.push(options.entryTypes);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  emit(entries: Array<Record<string, unknown>>): void {
    this.callback({ getEntries: () => entries });
  }
}

const emptyPerformance = {
  getEntriesByType: () => [] as Array<Record<string, unknown>>,
  now: () => 0,
} as unknown as Performance;

function findObserver(entryType: string): MockObserver | undefined {
  return MockObserver.instances.find((o) => o.observed.some((e) => e.includes(entryType)));
}

describe('usePerformanceBudget', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    MockObserver.instances = [];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const env = {
    PerformanceObserver: MockObserver,
    performance: emptyPerformance,
  };

  it('fails closed (unknown) when the window closes with no metrics', () => {
    const { result } = renderHook(() =>
      usePerformanceBudget({ route: '/', observationWindowMs: 1000, environment: env }),
    );
    expect(result.current.status).toBe('measuring');
    expect(result.current.isMonitoring).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.status).toBe('unknown');
    expect(result.current.metrics).toEqual({});
    expect(result.current.violations).toEqual([]);
    expect(result.current.routeBudget?.route).toBe('/');
  });

  it('resolves within-budget from real observed metrics', () => {
    const now = jest.fn().mockReturnValue(500);
    const { result } = renderHook(() =>
      usePerformanceBudget({
        route: '/identity',
        observationWindowMs: 1000,
        environment: {
          PerformanceObserver: MockObserver,
          performance: {
            getEntriesByType: (type: string) =>
              type === 'paint'
                ? [{ name: 'first-contentful-paint', startTime: 412 }]
                : type === 'navigation'
                  ? [{ startTime: 20, responseStart: 301 }]
                  : [],
            now: () => 500,
          } as unknown as Performance,
        },
        now,
      }),
    );

    expect(result.current.metrics).toEqual({ FCP: 412, TTFB: 281 });

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.status).toBe('within-budget');
    expect(result.current.measuredAt).toBe(500);
  });

  it('resolves over-budget with violations from observed LCP', () => {
    const { result } = renderHook(() =>
      usePerformanceBudget({ route: '/', observationWindowMs: 1000, environment: env }),
    );
    act(() => {
      findObserver('largest-contentful-paint')!.emit([
        { entryType: 'largest-contentful-paint', startTime: 9999 },
      ]);
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.status).toBe('over-budget');
    expect(result.current.violations.map((v) => v.name)).toEqual(['LCP']);
  });

  it('reports unsupported when PerformanceObserver is unavailable (fail-closed)', () => {
    const { result } = renderHook(() =>
      usePerformanceBudget({
        route: '/',
        environment: { performance: emptyPerformance },
      }),
    );
    expect(result.current.status).toBe('unsupported');
    expect(result.current.isSupported).toBe(false);
    expect(result.current.unsupportedReason).toContain('PerformanceObserver is not available');
  });

  it('retry reopens measurement and clears prior metrics', () => {
    const { result } = renderHook(() =>
      usePerformanceBudget({ route: '/', observationWindowMs: 1000, environment: env }),
    );
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.status).toBe('unknown');

    act(() => {
      result.current.retry();
    });
    expect(result.current.status).toBe('measuring');
    expect(result.current.metrics).toEqual({});

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.status).toBe('unknown');
  });

  it('reset returns to a clean idle state', () => {
    const { result } = renderHook(() =>
      usePerformanceBudget({ route: '/', observationWindowMs: 1000, environment: env }),
    );
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.isMonitoring).toBe(false);
  });

  it('stays idle when disabled and resets when toggled off', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        usePerformanceBudget({ route: '/', enabled, observationWindowMs: 1000, environment: env }),
      { initialProps: { enabled: true } },
    );
    expect(result.current.status).toBe('measuring');

    rerender({ enabled: false });
    expect(result.current.status).toBe('idle');
  });

  it('marks a terminal measurement as stale after the staleness window', () => {
    let clock = 1000;
    const { result } = renderHook(() =>
      usePerformanceBudget({
        route: '/',
        observationWindowMs: 1000,
        stalenessMs: 30000,
        now: () => clock,
        environment: env,
      }),
    );
    act(() => {
      findObserver('largest-contentful-paint')!.emit([
        { entryType: 'largest-contentful-paint', startTime: 900 },
      ]);
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.status).toBe('within-budget');
    expect(result.current.isStale).toBe(false);

    act(() => {
      clock = 1000 + 31000;
      jest.advanceTimersByTime(10000);
    });
    expect(result.current.isStale).toBe(true);
  });
});