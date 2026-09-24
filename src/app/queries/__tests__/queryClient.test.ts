import { queryClient } from '@/app/queries/queryClient';

describe('queryClient offline read defaults (V2-FE-129)', () => {
  it('retries with a bounded strategy and skips retries while offline', () => {
    const defaults = queryClient.getDefaultOptions().queries as {
      retry: (failureCount: number, error: Error) => boolean;
      retryDelay: (attempt: number) => number;
      refetchOnReconnect: boolean;
      networkMode: string;
      staleTime: number;
      gcTime: number;
    };

    expect(defaults.refetchOnReconnect).toBe(true);
    expect(defaults.networkMode).toBe('online');
    expect(defaults.staleTime).toBeGreaterThan(0);
    expect(defaults.gcTime).toBe(30 * 60 * 1000);

    // exponential backoff, capped
    expect(defaults.retryDelay(0)).toBe(1000);
    expect(defaults.retryDelay(1)).toBe(2000);
    expect(defaults.retryDelay(10)).toBe(30_000);

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    expect(defaults.retry(0, new Error('fail'))).toBe(true);
    expect(defaults.retry(1, new Error('fail'))).toBe(true);
    expect(defaults.retry(2, new Error('fail'))).toBe(false);

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    expect(defaults.retry(0, new Error('offline'))).toBe(false);

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });
});
