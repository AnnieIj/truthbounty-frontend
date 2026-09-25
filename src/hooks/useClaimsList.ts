// src/hooks/useClaimsList.ts
'use client';

/**
 * V2-FE-109 — Canonical claims list projection hook.
 *
 * Maps the React Query lifecycle onto explicit, user-visible states so the
 * components can render loading, ready, stale, empty, and error views without
 * guessing at query internals. The API is a projection/read layer: this hook
 * never fabricates rows, totals, or freshness.
 */

import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '@/app/queries/queryKeys';
import { fetchClaimsList } from '@/app/api/claims.api';
import {
  CLAIMS_LIST_DEFAULTS,
  createClaimsListError,
  validateClaimsListParams,
  type ClaimsListEnvelope,
  type ClaimsListError,
  type ClaimsListParams,
  type ClaimsListViewState,
} from '@/app/types/claim-list';

export interface UseClaimsListOptions {
  /** Debounced search text (already trimmed upstream by the consumer). */
  search?: string;
  status?: ClaimsListParams['filters']['status'];
  highImpact?: boolean;
  sort?: ClaimsListParams['sort'];
  page?: number;
  pageSize?: number;
  /** How long a successful projection is displayed as fresh (ms). */
  staleAfterMs?: number;
  /** Disable the query (e.g. unsupported filter state). Default: false. */
  enabled?: boolean;
}

export interface ClaimsListState {
  /** Explicit UI state; see ClaimsListViewState. */
  viewState: ClaimsListViewState;
  /** Page rows when `ready`/`ready-stale`, otherwise undefined. */
  data: ClaimsListEnvelope | undefined;
  /** Last successfully validated envelope, even while a refetch is in flight. */
  lastValid: ClaimsListEnvelope | undefined;
  /** Canonical error for `error` view state. */
  error: ClaimsListError | undefined;
  /** True while fetching with no previous data to show. */
  isLoading: boolean;
  /** True while any fetch (initial or background refetch) is in flight. */
  isFetching: boolean;
  /** Refetch after a failure; no-ops while not in `error`. */
  retry: () => void;
}

/**
 * Classify a thrown value into the view state the UI should present.
 * Exported for deterministic testing of the mapping rules.
 */
export function classifyClaimsListError(error: unknown): ClaimsListViewState {
  const code = (error as ClaimsListError | undefined)?.code;
  if (code === 'PROJECTION_STALE') return 'ready-stale';
  if (
    code === 'PROJECTION_UNAVAILABLE' ||
    code === 'PROJECTION_MALFORMED' ||
    code === 'UNSUPPORTED_REQUEST'
  ) {
    return 'error';
  }
  return 'error';
}

export function useClaimsList(options: UseClaimsListOptions = {}): ClaimsListState {
  const {
    search = '',
    status,
    highImpact,
    page = 1,
    pageSize = CLAIMS_LIST_DEFAULTS.pageSize,
    sort = { field: 'createdAt', direction: 'desc' },
    staleAfterMs = CLAIMS_LIST_DEFAULTS.staleAfterMs,
    enabled = true,
  } = options;

  const params: ClaimsListParams = {
    search,
    filters: { status, highImpact },
    pagination: { page, pageSize },
    sort,
  };

  const problems = validateClaimsListParams(params);
  // Fail closed on invalid request shapes: never hit the wire, and surface a
  // canonical error instead of an indefinite loading state.
  const paramError =
    problems.length > 0
      ? createClaimsListError(
          'UNSUPPORTED_REQUEST',
          `Invalid claims list request: ${problems.join('; ')}`
        )
      : undefined;
  const queryEnabled = enabled && problems.length === 0;

  const query: UseQueryResult<ClaimsListEnvelope, ClaimsListError> = useQuery({
    queryKey: queryKeys.claims.list({ search, status: status ?? null, highImpact: highImpact ?? null, page, pageSize, sort }),
    queryFn: ({ signal }) => fetchClaimsList(params, signal),
    enabled: queryEnabled,
    // Paginated read path: keep the previous page rendered while the next
    // page loads, so the table never collapses to a spinner between pages.
    placeholderData: keepPreviousData,
    // Read-path retry policy: transient unavailability is retried; malformed
    // projections are not (they will not heal on retry).
    retry: (failureCount, error) =>
      failureCount < 2 &&
      (error.code === 'PROJECTION_UNAVAILABLE' || error.code === 'UNKNOWN'),
    staleTime: staleAfterMs,
    refetchOnWindowFocus: true,
  });

  const lastValid = query.data;
  const envelope = query.data;

  // Freshness rules, applied purely from validated envelope data:
  // - The API may report `stale`/`degraded` projection freshness.
  // - A projection older than `staleAfterMs` is presented as stale as well,
  //   because presenting old critical data as fresh is a protocol-accuracy bug.
  let freshnessState: ClaimsListViewState = 'ready';
  if (envelope) {
    const generatedAtMs = Date.parse(envelope.projection.generatedAt);
    const age = Number.isFinite(generatedAtMs) ? Date.now() - generatedAtMs : Infinity;
    if (
      envelope.projection.freshness !== 'fresh' ||
      age > staleAfterMs
    ) {
      freshnessState = 'ready-stale';
    }
  }

  const queryError = (query.error as ClaimsListError | undefined) ?? undefined;
  const error = paramError ?? queryError;
  // While a page transition is in flight (keepPreviousData), `envelope` holds
  // the placeholder page: stay in `ready` instead of collapsing to a spinner.
  const viewState: ClaimsListViewState = paramError
    ? 'error'
    : query.isPending && !envelope
      ? 'loading'
      : queryError
        ? classifyClaimsListError(queryError)
        : envelope
          ? envelope.items.length === 0
            ? 'empty'
            : freshnessState
          : 'loading';

  return {
    viewState,
    data: envelope,
    lastValid,
    error,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    retry: () => {
      if (error) query.refetch();
    },
  };
}
