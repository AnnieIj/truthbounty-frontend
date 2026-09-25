// src/app/queries/freshness.queries.ts

import { useQuery } from '@tanstack/react-query';
import { fetchApiHealth } from '../api/freshness.api';
import type { ApiHealthResponse, UseApiFreshnessResult, UseApiFreshnessConfig } from '@/app/types/api-freshness';

/**
 * Query key for API freshness data
 */
export const freshnessQueryKey = ['api', 'freshness'] as const;

/**
 * Hook for fetching API freshness and degraded-state metadata
 * 
 * Exposes indexed height, finalized height, last update, lag, and dependency degradation
 * without claiming on-chain failure.
 * 
 * @param config - Configuration options for polling and thresholds
 * @returns Freshness data with loading, error, and refetch states
 */
export function useApiFreshness(config: UseApiFreshnessConfig = {}): UseApiFreshnessResult {
  const {
    pollInterval = 30_000, // 30 seconds default
    maxAcceptableLag = 100,
  } = config;

  const query = useQuery<ApiHealthResponse, Error>({
    queryKey: freshnessQueryKey,
    queryFn: fetchApiHealth,
    refetchInterval: pollInterval,
    refetchIntervalInBackground: true,
    staleTime: 10_000, // Consider data stale after 10 seconds
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
  });

  const isDegraded = query.data?.degradedState.isDegraded ?? false;
  const isFresh = query.data !== null && 
    !query.isLoading && 
    !query.isError && 
    (query.data.freshness.lag <= maxAcceptableLag);

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    isFresh,
    isDegraded,
  };
}

/**
 * Hook for fetching just the freshness data (without degraded state)
 * Useful for lightweight consumers
 */
export function useFreshnessData() {
  const query = useQuery<ApiHealthResponse['freshness'], Error>({
    queryKey: [...freshnessQueryKey, 'data'],
    queryFn: async () => {
      const response = await fetchApiHealth();
      return response.freshness;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 10_000,
  });

  return {
    freshness: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/**
 * Hook for fetching just the degraded state
 * Useful for components that only need degradation status
 */
export function useDegradedState() {
  const query = useQuery<ApiHealthResponse['degradedState'], Error>({
    queryKey: [...freshnessQueryKey, 'degraded'],
    queryFn: async () => {
      const response = await fetchApiHealth();
      return response.degradedState;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 10_000,
  });

  return {
    degradedState: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    isDegraded: query.data?.isDegraded ?? false,
  };
}

/**
 * Hook for fetching dependency health only
 */
export function useDependencyHealth() {
  const query = useQuery<ApiHealthResponse['freshness']['dependencies'], Error>({
    queryKey: [...freshnessQueryKey, 'dependencies'],
    queryFn: async () => {
      const response = await fetchApiHealth();
      return response.freshness.dependencies;
    },
    refetchInterval: 60_000, // Dependencies change less frequently
    refetchIntervalInBackground: true,
    staleTime: 30_000,
  });

  return {
    dependencies: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}