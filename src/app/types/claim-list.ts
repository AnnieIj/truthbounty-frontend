/**
 * V2 Claim List Projection Types — Canonical Optimism/EVM read path
 *
 * The claims list is an API projection of on-chain claim state. The API is a
 * read layer only: it never fabricates protocol state, and the contracts remain
 * authoritative for protocol mutation.
 *
 * Every envelope carries explicit projection metadata so the UI can show
 * `fresh` vs `stale` honestly instead of inventing success. Invalid projections
 * fail closed (see src/app/api/claims.api.ts).
 */

import type { Claim, ClaimStatus } from './claim';

/**
 * Canonical sort fields the API projection supports.
 * `createdAt_desc` is the default (newest first).
 */
export type ClaimSortField = 'createdAt' | 'title' | 'confidenceScore';

export type ClaimSortDirection = 'asc' | 'desc';

export interface ClaimsListSort {
  field: ClaimSortField;
  direction: ClaimSortDirection;
}

/**
 * Server-side filters. Unknown status values are rejected client-side
 * (fail closed) rather than silently widened to `all`.
 */
export interface ClaimsListFilters {
  /** Canonical status filter; undefined = no status filter (all claims). */
  status?: ClaimStatus;
  /** Only claims whose impact flag matches. */
  highImpact?: boolean;
}

/**
 * Pagination. The API is authoritative over paging: `page` is 1-based and the
 * client never slices a "full" list itself.
 */
export interface ClaimsListPagination {
  page: number;
  pageSize: number;
}

export interface ClaimsListParams {
  search: string;
  filters: ClaimsListFilters;
  pagination: ClaimsListPagination;
  sort: ClaimsListSort;
}

export interface ClaimsListDefaults {
  pageSize: number;
  debounceMs: number;
  /** Projection age (ms) beyond which the view is shown as stale. */
  staleAfterMs: number;
}

export const CLAIMS_LIST_DEFAULTS: ClaimsListDefaults = {
  pageSize: 10,
  debounceMs: 250,
  /** 60s: past this age the projection is treated as stale critical data. */
  staleAfterMs: 60_000,
};

export const CLAIMS_LIST_MIN_PAGE_SIZE = 1;
export const CLAIMS_LIST_MAX_PAGE_SIZE = 100;

/**
 * Projection freshness as reported by the API envelope.
 * - `fresh`: projection is current with the indexer cursor
 * - `stale`: the indexer fell behind; data shown must be marked stale
 * - `degraded`: partial data (some rows dropped server-side); must be visible
 */
export type ProjectionFreshness = 'fresh' | 'stale' | 'degraded';

/**
 * One claim row in the list projection. Derived display values that the
 * canonical projection does not provide are explicitly `null`, never invented.
 */
export interface ClaimListItem {
  id: string;
  title: string;
  category?: string;
  status: ClaimStatus;
  claimantAddress?: string;
  /** 0-100 canonical confidence; null when the claim has not been scored. */
  confidenceScore: number | null;
  totalStaked: number;
  highImpact: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * API envelope for the claims list read path. `items` is the canonical page;
 * `pagination.total` is the server-reported total so the client never guesses.
 */
export interface ClaimsListEnvelope {
  items: ClaimListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  projection: {
    freshness: ProjectionFreshness;
    /** ISO timestamp of when the projection was generated. */
    generatedAt: string;
    /** Server-reported reason when freshness is `stale` or `degraded`. */
    reason?: string;
  };
}

/**
 * Canonical, user-visible failure codes for the list read path.
 * These map 1:1 to testable failure states in the UI.
 */
export type ClaimsListErrorCode =
  | 'PROJECTION_UNAVAILABLE'
  | 'PROJECTION_MALFORMED'
  | 'PROJECTION_STALE'
  | 'UNSUPPORTED_REQUEST'
  | 'UNKNOWN';

export interface ClaimsListError extends Error {
  code: ClaimsListErrorCode;
}

export function createClaimsListError(
  code: ClaimsListErrorCode,
  message: string
): ClaimsListError {
  const error = new Error(message) as ClaimsListError;
  error.code = code;
  error.name = 'ClaimsListError';
  return error;
}

/**
 * UI-facing view state derived from the query. The hook maps React Query
 * internals onto these explicit states so components never branch on
 * isLoading/isFetching internals themselves.
 */
export type ClaimsListViewState =
  | 'loading'
  | 'ready'
  | 'ready-stale'
  | 'empty'
  | 'error';

export function isClaimStatus(value: unknown): value is ClaimStatus {
  return (
    value === 'OPEN' ||
    value === 'UNDER_REVIEW' ||
    value === 'VERIFIED' ||
    value === 'REJECTED' ||
    value === 'DISPUTED'
  );
}

/**
 * Validate claims list params. Returns a list of problems; empty means valid.
 * Pagination is clamped, not rejected, so a bad deep link cannot brick the UI.
 */
export function validateClaimsListParams(
  params: Partial<ClaimsListParams>
): string[] {
  const problems: string[] = [];

  if (params.pagination) {
    const { page, pageSize } = params.pagination;
    if (!Number.isInteger(page) || page < 1) {
      problems.push('pagination.page must be a positive integer');
    }
    if (
      !Number.isInteger(pageSize) ||
      pageSize < CLAIMS_LIST_MIN_PAGE_SIZE ||
      pageSize > CLAIMS_LIST_MAX_PAGE_SIZE
    ) {
      problems.push(
        `pagination.pageSize must be an integer between ${CLAIMS_LIST_MIN_PAGE_SIZE} and ${CLAIMS_LIST_MAX_PAGE_SIZE}`
      );
    }
  }

  if (params.filters?.status !== undefined && !isClaimStatus(params.filters.status)) {
    problems.push(`filters.status "${String(params.filters.status)}" is not a canonical claim status`);
  }

  return problems;
}

/**
 * Type guard narrowing an unknown payload to a ClaimListItem. Used by the
 * API layer to fail closed on malformed projections.
 */
export function isClaimListItem(value: unknown): value is ClaimListItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;

  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.title === 'string' &&
    isClaimStatus(item.status) &&
    typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string' &&
    typeof item.totalStaked === 'number' &&
    Number.isFinite(item.totalStaked) &&
    typeof item.highImpact === 'boolean' &&
    (item.confidenceScore === null ||
      (typeof item.confidenceScore === 'number' &&
        Number.isFinite(item.confidenceScore))) &&
    (item.category === undefined || typeof item.category === 'string') &&
    (item.claimantAddress === undefined ||
      typeof item.claimantAddress === 'string')
  );
}

/** Full claim type re-exported for callers that need the detail shape. */
export type { Claim };
