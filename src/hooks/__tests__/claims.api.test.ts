// Unit tests for the canonical claims list API layer (V2-FE-109).
// Covers: wire-format construction, fail-closed parsing, and canonical errors.

import { fetchClaimsList, buildClaimsListQuery } from '@/app/api/claims.api';
import {
  makeEnvelope,
  makeJsonResponse,
  makeNonJsonResponse,
} from './claim-list-fixtures';

const defaultParams = {
  search: '',
  filters: { status: undefined, highImpact: undefined },
  pagination: { page: 1, pageSize: 10 },
  sort: { field: 'createdAt' as const, direction: 'desc' as const },
};

function jsonResponse(
  body: unknown,
  init: { status?: number; contentType?: string } = {}
) {
  const { status = 200, contentType = 'application/json' } = init;
  if (contentType !== 'application/json') {
    return makeNonJsonResponse(status);
  }
  return makeJsonResponse(body, { status });
}

describe('buildClaimsListQuery', () => {
  it('builds a minimal query for defaults (omits empty filters)', () => {
    expect(buildClaimsListQuery(defaultParams)).toBe('page=1&pageSize=10&sort=createdAt.desc');
  });

  it('encodes trimmed search text', () => {
    const query = buildClaimsListQuery({ ...defaultParams, search: '  vaccine  ' });
    expect(query).toContain('search=vaccine');
    expect(query).not.toContain('vaccine  ');
  });

  it('encodes status and highImpact filters', () => {
    const query = buildClaimsListQuery({
      ...defaultParams,
      filters: { status: 'DISPUTED', highImpact: true },
    });
    expect(query).toContain('status=DISPUTED');
    expect(query).toContain('highImpact=true');
  });

  it('encodes pagination and sort', () => {
    const query = buildClaimsListQuery({
      ...defaultParams,
      pagination: { page: 3, pageSize: 25 },
      sort: { field: 'confidenceScore', direction: 'asc' },
    });
    expect(query).toContain('page=3');
    expect(query).toContain('pageSize=25');
    expect(query).toContain('sort=confidenceScore.asc');
  });
});

describe('fetchClaimsList', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a validated envelope on success', async () => {
    const envelope = makeEnvelope();
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(envelope));

    const result = await fetchClaimsList(defaultParams);
    expect(result).toEqual(envelope);
  });

  it('clamps out-of-range pagination instead of forwarding it', async () => {
    const envelope = makeEnvelope();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(envelope));

    await fetchClaimsList({
      ...defaultParams,
      pagination: { page: -5, pageSize: 9999 },
    });

    const calledWith = fetchMock.mock.calls[0][0] as string;
    expect(calledWith).toContain('page=1');
    expect(calledWith).toContain('pageSize=100');
  });

  it('throws UNSUPPORTED_REQUEST on 400', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, { status: 400 }));
    await expect(fetchClaimsList(defaultParams)).rejects.toMatchObject({
      code: 'UNSUPPORTED_REQUEST',
    });
  });

  it('throws PROJECTION_STALE on 503', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, { status: 503 }));
    await expect(fetchClaimsList(defaultParams)).rejects.toMatchObject({
      code: 'PROJECTION_STALE',
    });
  });

  it('throws PROJECTION_UNAVAILABLE on other non-2xx statuses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}, { status: 500 }));
    await expect(fetchClaimsList(defaultParams)).rejects.toMatchObject({
      code: 'PROJECTION_UNAVAILABLE',
    });
  });

  it('throws PROJECTION_UNAVAILABLE when the network fails', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchClaimsList(defaultParams)).rejects.toMatchObject({
      code: 'PROJECTION_UNAVAILABLE',
    });
  });

  it('rethrows AbortError untouched so React Query cancellation works', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    jest.spyOn(global, 'fetch').mockRejectedValue(abortError);
    await expect(fetchClaimsList(defaultParams)).rejects.toBe(abortError);
  });

  it('throws PROJECTION_MALFORMED on a non-JSON body', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse('oops', { contentType: 'text/html' }));
    await expect(fetchClaimsList(defaultParams)).rejects.toMatchObject({
      code: 'PROJECTION_MALFORMED',
    });
  });

  it('throws PROJECTION_MALFORMED when items is missing', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}));
    await expect(fetchClaimsList(defaultParams)).rejects.toMatchObject({
      code: 'PROJECTION_MALFORMED',
    });
  });

  it('throws PROJECTION_MALFORMED when a row violates the schema', async () => {
    const envelope = makeEnvelope();
    (envelope.items[0] as unknown as Record<string, unknown>).status = 'NOT_A_STATUS';
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(envelope));

    await expect(fetchClaimsList(defaultParams)).rejects.toMatchObject({
      code: 'PROJECTION_MALFORMED',
    });
  });

  it('throws PROJECTION_MALFORMED when pagination block is malformed', async () => {
    const envelope = makeEnvelope();
    (envelope.pagination as unknown as Record<string, unknown>).total = 'many';
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(envelope));

    await expect(fetchClaimsList(defaultParams)).rejects.toMatchObject({
      code: 'PROJECTION_MALFORMED',
    });
  });

  it('throws PROJECTION_MALFORMED when freshness metadata is invalid', async () => {
    const envelope = makeEnvelope();
    (envelope.projection as unknown as Record<string, unknown>).freshness = 'totally-fresh';
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(envelope));

    await expect(fetchClaimsList(defaultParams)).rejects.toMatchObject({
      code: 'PROJECTION_MALFORMED',
    });
  });

  it('propagates the abort signal to fetch', async () => {
    const envelope = makeEnvelope();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(envelope));
    const controller = new AbortController();

    await fetchClaimsList(defaultParams, controller.signal);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });
});
