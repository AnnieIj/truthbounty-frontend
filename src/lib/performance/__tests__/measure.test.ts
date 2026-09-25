import {
  createWebVitalsObserver,
  performanceObserverSupported,
  type ObserverEntryList,
  type PerformanceObserverAdapter,
} from '@/lib/performance/measure';

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

describe('measure.ts web-vitals observer', () => {
  beforeEach(() => {
    MockObserver.instances = [];
  });

  it('reports null (fail-closed) when PerformanceObserver is unavailable', () => {
    expect(createWebVitalsObserver({ PerformanceObserver: undefined } as never)).toBeNull();
  });

  it('detects support via performanceObserverSupported', () => {
    expect(performanceObserverSupported({ PerformanceObserver: MockObserver })).toBe(true);
    expect(
      performanceObserverSupported({ PerformanceObserver: undefined } as never),
    ).toBe(false);
  });

  it('reports LCP from the last largest-contentful-paint entry', () => {
    const reports = jest.fn();
    const now = jest.fn().mockReturnValue(1000);
    const observer = createWebVitalsObserver({
      PerformanceObserver: MockObserver,
      now,
    });
    expect(observer).not.toBeNull();
    const cleanup = observer!.start(reports);

    const lcp = MockObserver.instances.find((o) => o.observed.some((e) => e.includes('largest-contentful-paint')));
    expect(lcp).toBeDefined();
    lcp!.emit([{ entryType: 'largest-contentful-paint', startTime: 812 }]);
    lcp!.emit([{ entryType: 'largest-contentful-paint', startTime: 940 }]);

    expect(reports).toHaveBeenCalledWith({ name: 'LCP', value: 940, measuredAt: 1000 });

    cleanup();
  });

  it('reports CLS excluding recent-input shifts', () => {
    const reports = jest.fn();
    const observer = createWebVitalsObserver({ PerformanceObserver: MockObserver, now: () => 0 });
    observer!.start(reports);
    const cls = MockObserver.instances.find((o) => o.observed.some((e) => e.includes('layout-shift')));
    cls!.emit([
      { entryType: 'layout-shift', value: 0.05, hadRecentInput: true },
      { entryType: 'layout-shift', value: 0.02, hadRecentInput: false },
      { entryType: 'layout-shift', value: 0.01, hadRecentInput: false },
    ]);
    expect(reports).toHaveBeenCalledWith({ name: 'CLS', value: 0.03, measuredAt: 0 });
  });

  it('reports INP as the worst event duration', () => {
    const reports = jest.fn();
    const observer = createWebVitalsObserver({ PerformanceObserver: MockObserver, now: () => 5 });
    observer!.start(reports);
    const inp = MockObserver.instances.find((o) => o.observed.some((e) => e.includes('event')));
    inp!.emit([
      { entryType: 'event', duration: 60 },
      { entryType: 'event', duration: 210 },
      { entryType: 'event', duration: 90 },
    ]);
    expect(reports).toHaveBeenCalledWith({ name: 'INP', value: 210, measuredAt: 5 });
  });

  it('reports FCP and TTFB synchronously from navigation/paint entries', () => {
    const reports = jest.fn();
    const observer = createWebVitalsObserver({
      PerformanceObserver: MockObserver,
      now: () => 1,
      performance: {
        now: () => 1,
        getEntriesByType: (type: string) => {
          if (type === 'paint') {
            return [{ name: 'first-contentful-paint', startTime: 412 }];
          }
          if (type === 'navigation') {
            return [{ startTime: 20, responseStart: 301 }];
          }
          return [];
        },
      } as unknown as Performance,
    });
    observer!.start(reports);
    expect(reports).toHaveBeenCalledWith({ name: 'FCP', value: 412, measuredAt: 1 });
    expect(reports).toHaveBeenCalledWith({ name: 'TTFB', value: 281, measuredAt: 1 });
  });

  it('cleanup disconnects every observer', () => {
    const observer = createWebVitalsObserver({ PerformanceObserver: MockObserver });
    const cleanup = observer!.start(() => {});
    expect(MockObserver.instances.length).toBeGreaterThan(0);
    cleanup();
    for (const instance of MockObserver.instances) {
      expect(instance.disconnected).toBe(true);
    }
  });
});