'use client';

/**
 * useApiWithFallback — API projection layer with stale detection, retry,
 * and degraded-mode flag.
 * V2-FE-136
 *
 * Security invariants:
 * - Never fabricates data; returns null until a real fetch succeeds.
 * - Exposes isBlocked=true when data is critically stale, preventing writes.
 * - Does not retry after criticalAfterMs without explicit user-initiated reload.
 * - All error states are surfaced; none are silently swallowed.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ApiProjectionState,
  StalenessThresholds,
} from '@/lib/rpc-fallback/types';
import { DEFAULT_STALENESS } from '@/lib/rpc-fallback/types';

export interface UseApiWithFallbackOptions<T> {
  /** The fetch function. Must throw on error. */
  fetcher: () => Promise<T>;
  /** Query key — changes trigger a fresh fetch. */
  queryKey: readonly unknown[];
  staleness?: Partial<StalenessThresholds>;
  /**
   * Maximum number of automatic retry attempts on transient failures.
   * Default: 3. Retries stop once criticalAfterMs is exceeded.
   */
  maxRetries?: number;
  /** Initial retry delay in ms (doubles each attempt). Default: 1 000. */
  retryDelayMs?: number;
  /** Disable automatic fetching (useful in tests). Default: false. */
  disabled?: boolean;
}

export type UseApiWithFallbackReturn<T> = ApiProjectionState<T> & {
  /** Manually trigger a fresh fetch, resetting retry counter. */
  reload: () => void;
};

function deriveStatus<T>(
  state: Pick<ApiProjectionState<T>, 'data' | 'lastFetchedMs' | 'consecutiveFailures' | 'isRefreshing'>,
  staleness: StalenessThresholds,
): ApiProjectionState<T>['status'] {
  const now = Date.now();

  if (state.isRefreshing && state.data === null) return 'loading';
  if (state.data === null && state.consecutiveFailures === 0) return 'loading';
  if (state.data === null && state.consecutiveFailures > 0) return 'unavailable';

  const age = state.lastFetchedMs !== null ? now - state.lastFetchedMs : Infinity;

  if (state.consecutiveFailures > 0) return 'error';
  if (age >= staleness.criticalAfterMs) return 'critical';
  if (age >= staleness.staleAfterMs) return 'stale';
  return 'fresh';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useApiWithFallback<T>(
  options: UseApiWithFallbackOptions<T>,
): UseApiWithFallbackReturn<T> {
  const {
    fetcher,
    queryKey,
    maxRetries = 3,
    retryDelayMs = 1_000,
    disabled = false,
  } = options;

  const staleness: StalenessThresholds = {
    ...DEFAULT_STALENESS,
    ...options.staleness,
  };

  const [state, setState] = useState<ApiProjectionState<T>>({
    data: null,
    status: 'loading',
    lastFetchedMs: null,
    dataAgeMs: null,
    isRefreshing: false,
    isStale: false,
    isBlocked: false,
    error: null,
    consecutiveFailures: 0,
  });

  // Keep fetcher ref so the effect doesn't depend on it directly
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);

  // Track mount to avoid setting state after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const doFetch = useCallback(
    async (retryCount = 0): Promise<void> => {
      if (!mountedRef.current) return;

      setState((prev) => ({
        ...prev,
        isRefreshing: true,
        error: null,
      }));

      try {
        const data = await fetcherRef.current();
        if (!mountedRef.current) return;

        const now = Date.now();
        setState((prev) => ({
          ...prev,
          data,
          status: 'fresh',
          lastFetchedMs: now,
          dataAgeMs: 0,
          isRefreshing: false,
          isStale: false,
          isBlocked: false,
          error: null,
          consecutiveFailures: 0,
        }));
      } catch (err: unknown) {
        if (!mountedRef.current) return;

        const error = err instanceof Error ? err : new Error(String(err));
        const nextConsecutive = retryCount + 1;

        // Automatic retry with exponential backoff
        const shouldRetry = retryCount < maxRetries;
        const isNotCriticalYet =
          state.lastFetchedMs === null ||
          Date.now() - state.lastFetchedMs < staleness.criticalAfterMs;

        if (shouldRetry && isNotCriticalYet) {
          const delay = retryDelayMs * Math.pow(2, retryCount);
          await sleep(delay);
          if (mountedRef.current) {
            await doFetch(nextConsecutive);
          }
          return;
        }

        setState((prev) => {
          const newConsecutive = prev.consecutiveFailures + 1;
          const status = deriveStatus(
            { ...prev, consecutiveFailures: newConsecutive, isRefreshing: false },
            staleness,
          );
          return {
            ...prev,
            status,
            isRefreshing: false,
            error,
            consecutiveFailures: newConsecutive,
            isStale: status === 'stale' || status === 'critical',
            isBlocked: status === 'critical' || status === 'unavailable',
          };
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxRetries, retryDelayMs, staleness.criticalAfterMs, staleness.staleAfterMs],
  );

  // Fetch on mount and when queryKey changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queryKeyString = JSON.stringify(queryKey);
  useEffect(() => {
    if (disabled) return;
    setState({
      data: null,
      status: 'loading',
      lastFetchedMs: null,
      dataAgeMs: null,
      isRefreshing: false,
      isStale: false,
      isBlocked: false,
      error: null,
      consecutiveFailures: 0,
    });
    doFetch(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKeyString, disabled]);

  // Tick dataAgeMs every 10 s so consumers get up-to-date staleness info
  useEffect(() => {
    const timer = setInterval(() => {
      setState((prev) => {
        if (prev.lastFetchedMs === null) return prev;
        const now = Date.now();
        const dataAgeMs = now - prev.lastFetchedMs;
        const status = deriveStatus(
          { ...prev, data: prev.data, isRefreshing: prev.isRefreshing },
          staleness,
        );
        return {
          ...prev,
          dataAgeMs,
          status,
          isStale: status === 'stale' || status === 'critical',
          isBlocked: status === 'critical' || status === 'unavailable',
        };
      });
    }, 10_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleness.staleAfterMs, staleness.criticalAfterMs]);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, consecutiveFailures: 0, error: null }));
    doFetch(0);
  }, [doFetch]);

  return { ...state, reload };
}
