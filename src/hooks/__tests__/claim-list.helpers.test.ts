// Unit tests for claim-list helpers (V2-FE-109):
// pagination window, relative-age formatting, and param validation/type guards.

import { getPaginationWindow, formatRelativeAge } from '@/app/lib/format';
import {
  isClaimListItem,
  validateClaimsListParams,
  CLAIMS_LIST_DEFAULTS,
} from '@/app/types/claim-list';
import { makeClaimItem, NOW_MS, isoAgo } from './claim-list-fixtures';

describe('getPaginationWindow', () => {
  it('returns every page when total is small', () => {
    expect(getPaginationWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns [1] for degenerate inputs', () => {
    expect(getPaginationWindow(0, 0)).toEqual([1]);
    expect(getPaginationWindow(3, 1)).toEqual([1]);
    expect(getPaginationWindow(Number.NaN, 5)).toEqual([1]);
  });

  it('clamps the current page into range', () => {
    expect(getPaginationWindow(99, 10)).toEqual([1, null, 9, 10]);
  });

  it('windows around the current page in the middle', () => {
    expect(getPaginationWindow(5, 20)).toEqual([1, null, 4, 5, 6, null, 20]);
  });

  it('keeps the window tight at the start', () => {
    expect(getPaginationWindow(1, 20)).toEqual([1, 2, null, 20]);
  });

  it('keeps the window tight at the end', () => {
    expect(getPaginationWindow(20, 20)).toEqual([1, null, 19, 20]);
  });

  it('avoids a leading ellipse when adjacent to page 1', () => {
    expect(getPaginationWindow(3, 20)).toEqual([1, 2, 3, 4, null, 20]);
  });
});

describe('formatRelativeAge', () => {
  it('renders just now for sub-minute ages', () => {
    expect(formatRelativeAge(isoAgo(30_000), NOW_MS)).toBe('just now');
  });

  it('renders minutes', () => {
    expect(formatRelativeAge(isoAgo(5 * 60_000), NOW_MS)).toBe('5m ago');
  });

  it('renders hours', () => {
    expect(formatRelativeAge(isoAgo(3 * 3_600_000), NOW_MS)).toBe('3h ago');
  });

  it('renders days', () => {
    expect(formatRelativeAge(isoAgo(2 * 86_400_000), NOW_MS)).toBe('2d ago');
  });

  it('renders the placeholder for missing or unparsable input', () => {
    expect(formatRelativeAge(undefined, NOW_MS)).toBe('—');
    expect(formatRelativeAge(null, NOW_MS)).toBe('—');
    expect(formatRelativeAge('not-a-date', NOW_MS)).toBe('—');
  });

  it('clamps future timestamps to just now instead of negative ages', () => {
    expect(formatRelativeAge(isoAgo(-90_000), NOW_MS)).toBe('just now');
  });
});

describe('validateClaimsListParams', () => {
  const validBase = {
    search: '',
    filters: {},
    pagination: { page: 1, pageSize: CLAIMS_LIST_DEFAULTS.pageSize },
    sort: { field: 'createdAt' as const, direction: 'desc' as const },
  };

  it('accepts canonical params', () => {
    expect(validateClaimsListParams(validBase)).toEqual([]);
  });

  it('rejects non-positive page numbers', () => {
    const problems = validateClaimsListParams({
      ...validBase,
      pagination: { page: 0, pageSize: 10 },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('pagination.page');
  });

  it('rejects page sizes outside the canonical bounds', () => {
    const problems = validateClaimsListParams({
      ...validBase,
      pagination: { page: 1, pageSize: 500 },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('pagination.pageSize');
  });

  it('rejects unknown status filters (fail closed)', () => {
    const problems = validateClaimsListParams({
      ...validBase,
      filters: { status: 'SETTLED' as never },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('not a canonical claim status');
  });
});

describe('isClaimListItem', () => {
  it('accepts a canonical row', () => {
    expect(isClaimListItem(makeClaimItem())).toBe(true);
  });

  it('accepts a row with null confidence (not yet scored)', () => {
    expect(isClaimListItem(makeClaimItem({ confidenceScore: null }))).toBe(true);
  });

  it('rejects non-canonical statuses', () => {
    expect(
      isClaimListItem(makeClaimItem({ status: 'FINALIZED' as never }))
    ).toBe(false);
  });

  it('rejects non-finite stakes and confidence values', () => {
    expect(isClaimListItem(makeClaimItem({ totalStaked: Number.NaN }))).toBe(false);
    expect(isClaimListItem(makeClaimItem({ confidenceScore: Number.NaN }))).toBe(false);
  });

  it('rejects missing ids, titles, or timestamps', () => {
    expect(isClaimListItem(makeClaimItem({ id: '' }))).toBe(false);
    expect(isClaimListItem(makeClaimItem({ title: undefined as never }))).toBe(false);
    expect(isClaimListItem(makeClaimItem({ createdAt: undefined as never }))).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(isClaimListItem(null)).toBe(false);
    expect(isClaimListItem('claim')).toBe(false);
  });
});
