import {
  buildClaimListUrlSearch,
  DEFAULT_CLAIM_LIST_SORT,
  parseClaimListUrl,
} from '@/app/lib/claim-list-url';

describe('claim list URL state', () => {
  it('round-trips validated search, filter, impact, and sort values', () => {
    const state = parseClaimListUrl(
      new URLSearchParams(
        'search=water%20rights&status=OPEN&highImpact=true&sort=title.asc'
      )
    );

    expect(state).toEqual({
      search: 'water rights',
      status: 'OPEN',
      highImpact: true,
      sort: { field: 'title', direction: 'asc' },
    });
    expect(buildClaimListUrlSearch(state)).toBe(
      'search=water+rights&status=OPEN&highImpact=true&sort=title.asc'
    );
  });

  it('rejects unknown, obsolete, unsafe, and malformed values', () => {
    const state = parseClaimListUrl(
      new URLSearchParams(
        'q=old&status=ADMIN&highImpact=yes&sort=reward.desc&search=%00unsafe'
      )
    );

    expect(state).toEqual({
      search: '',
      status: undefined,
      highImpact: false,
      sort: DEFAULT_CLAIM_LIST_SORT,
    });
    expect(buildClaimListUrlSearch(state)).toBe('sort=createdAt.desc');
  });
});