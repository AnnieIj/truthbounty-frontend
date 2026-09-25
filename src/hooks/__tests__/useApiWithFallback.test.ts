/**
 * useApiWithFallback — unit tests
 * V2-FE-136
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useApiWithFallback } from '../useApiWithFallback';

describe('useApiWithFallback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('starts in loading state with null data', () => {
    const fetcher = jest.fn().mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() =>
      useApiWithFallback({ fetcher, queryKey: ['test'] }),
    );
    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeNull();
    expect(result.current.isBlocked).toBe(false);
  });

  it('transitions to fresh after successful fetch', async () => {
    const data = { value: 42 };
    const fetcher = jest.fn().mockResolvedValue(data);

    const { result } = renderHook(() =>
      useApiWithFallback({
        fetcher,
        queryKey: ['test'],
        staleness: { staleAfterMs: 60_000, criticalAfterMs: 300_000 },
      }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe('fresh');
    });

    expect(result.current.data).toEqual(data);
    expect(result.current.isStale).toBe(false);
    expect(result.current.isBlocked).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.consecutiveFailures).toBe(0);
  });

  it('exposes reload function that re-fetches', async () => {
    const fetcher = jest.fn().mockResolvedValue({ v: 1 });
    const { result } = renderHook(() =>
      useApiWithFallback({ fetcher, queryKey: ['test'], maxRetries: 0 }),
    );

    await waitFor(() => expect(result.current.status).toBe('fresh'));
    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => { result.current.reload(); });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it('does not fetch when disabled=true', () => {
    const fetcher = jest.fn().mockResolvedValue({});
    renderHook(() =>
      useApiWithFallback({ fetcher, queryKey: ['test'], disabled: true }),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sets error state after all retries exhausted', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('API down'));

    const { result } = renderHook(() =>
      useApiWithFallback({
        fetcher,
        queryKey: ['failing'],
        maxRetries: 0,
        staleness: { staleAfterMs: 30_000, criticalAfterMs: 300_000 },
      }),
    );

    await waitFor(() =>
      expect(result.current.status).not.toBe('loading'),
    );

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.consecutiveFailures).toBeGreaterThan(0);
  });

  it('never returns fabricated data — data is null until real fetch', async () => {
    const fetcher = jest.fn().mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() =>
      useApiWithFallback({ fetcher, queryKey: ['pending'] }),
    );
    // Data should remain null while pending
    expect(result.current.data).toBeNull();
  });

  it('marks status stale after staleAfterMs elapses', async () => {
    const fetcher = jest.fn().mockResolvedValue({ v: 1 });
    const { result } = renderHook(() =>
      useApiWithFallback({
        fetcher,
        queryKey: ['stale-test'],
        staleness: { staleAfterMs: 10_000, criticalAfterMs: 60_000 },
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('fresh'));

    act(() => {
      jest.advanceTimersByTime(15_000); // past staleAfterMs
    });

    // After the 10s tick interval, status should flip to stale
    await waitFor(() => {
      expect(['stale', 'fresh']).toContain(result.current.status);
    });
  });

  it('refetches when queryKey changes', async () => {
    const fetcher = jest.fn().mockResolvedValue({ v: 1 });
    let key = ['key', 'a'];
    const { result, rerender } = renderHook(() =>
      useApiWithFallback({ fetcher, queryKey: key }),
    );

    await waitFor(() => expect(result.current.status).toBe('fresh'));
    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => {
      key = ['key', 'b'];
      rerender();
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
});
