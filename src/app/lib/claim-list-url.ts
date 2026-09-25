import {
  isClaimStatus,
  type ClaimSortDirection,
  type ClaimSortField,
  type ClaimsListSort,
} from '@/app/types/claim-list';
import type { ClaimStatus } from '@/app/types/claim';

export interface ClaimListUrlState {
  search: string;
  status?: ClaimStatus;
  highImpact: boolean;
  sort: ClaimsListSort;
}

export const DEFAULT_CLAIM_LIST_SORT: ClaimsListSort = {
  field: 'createdAt',
  direction: 'desc',
};

const VALID_SORT_FIELDS: readonly ClaimSortField[] = [
  'createdAt',
  'title',
  'confidenceScore',
];
const VALID_SORT_DIRECTIONS: readonly ClaimSortDirection[] = ['asc', 'desc'];
const MAX_SEARCH_LENGTH = 200;

function isSafeSearch(value: string): boolean {
  return value.length <= MAX_SEARCH_LENGTH && !/[\u0000-\u001f\u007f]/.test(value);
}

function parseSort(value: string | null): ClaimsListSort {
  if (!value) return DEFAULT_CLAIM_LIST_SORT;
  const [field, direction] = value.split('.');
  if (
    VALID_SORT_FIELDS.includes(field as ClaimSortField) &&
    VALID_SORT_DIRECTIONS.includes(direction as ClaimSortDirection)
  ) {
    return {
      field: field as ClaimSortField,
      direction: direction as ClaimSortDirection,
    };
  }
  return DEFAULT_CLAIM_LIST_SORT;
}

export function parseClaimListUrl(searchParams: URLSearchParams): ClaimListUrlState {
  const rawSearch = searchParams.get('search')?.trim() ?? '';
  const rawStatus = searchParams.get('status');
  const rawHighImpact = searchParams.get('highImpact');

  return {
    search: isSafeSearch(rawSearch) ? rawSearch : '',
    status: rawStatus && isClaimStatus(rawStatus) ? rawStatus : undefined,
    highImpact: rawHighImpact === 'true',
    sort: parseSort(searchParams.get('sort')),
  };
}

export function buildClaimListUrlSearch(state: ClaimListUrlState): string {
  const params = new URLSearchParams();
  const search = state.search.trim();

  if (isSafeSearch(search) && search.length > 0) params.set('search', search);
  if (state.status && isClaimStatus(state.status)) params.set('status', state.status);
  if (state.highImpact) params.set('highImpact', 'true');
  if (
    VALID_SORT_FIELDS.includes(state.sort.field) &&
    VALID_SORT_DIRECTIONS.includes(state.sort.direction)
  ) {
    params.set('sort', `${state.sort.field}.${state.sort.direction}`);
  }

  return params.toString();
}