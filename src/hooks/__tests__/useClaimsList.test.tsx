// Hook tests for useClaimsList (V2-FE-109): state mapping, freshness, retry.

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useClaimsList, classifyClaimsListError } from '../useClaimsList';
import { createClaimsListError } from '@/app/types/claim-list';
import { makeEnvelope, makeJsonResponse } from './claim-list-fixtures';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(makeJsonResponse(payload, { status }));
}

describe('classifyClaimsListError', () => {
  it('maps PROJECTION_STALE to ready-stale (renderable, flagged stale)', () => {
    expect(
      classifyClaimsListError(createClaimsListError('PROJECTION_STALE', 'stale'))
    ).toBe('ready-stale');
  });

  it('maps availability and integrity failures to error', () => {
    for (const code of [
      'PROJECTION_UNAVAILABLE',
      'PROJECTION_MALFORMED',
      'UNSUPPORTED_REQUEST',
    ] as const) {
      expect(classifyClaimsListError(createClaimsListError(code, 'x'))).toBe('error');
    }
  });

  it('fails closed on unknown errors', () => {
    expect(classifyClaimsListError(new Error('mystery'))).toBe('error');
  });
});

describe('useClaimsList', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts in loading, then reports ready with canonical data', async () => {
    const envelope = makeEnvelope();
    mockFetchOnce(envelope);

    const { result } = renderHook(() => useClaimsList(), {
      wrapper: createWrapper(),
    });

    expect(result.current.viewState).toBe('loading');

    await waitFor(() => expect(result.current.viewState).toBe('ready'));
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.pagination.total).toBe(1);
  });

  it('reports empty for a validated but page-less projection', async () => {
    mockFetchOnce(makeEnvelope({ items: [] }));

    const { result } = renderHook(() => useClaimsList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.viewState).toBe('empty'));
  });

  it('reports ready-stale when the API marks the projection stale', async () => {
    mockFetchOnce(
      makeEnvelope({
        freshness: 'stale',
        generatedAt: '2026-09-24T00:00:00Z',
        reason: 'Indexer lagging behind chain head',
      })
    );

    const { result } = renderHook(() => useClaimsList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.viewState).toBe('ready-stale'));
  });

  it('reports ready-stale when the projection is older than staleAfterMs', async () => {
    mockFetchOnce(
      makeEnvelope({ generatedAt: '2026-01-01T00:00:00Z' })
    );

    const { result } = renderHook(
      () => useClaimsList({ staleAfterMs: 60_000 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.viewState).toBe('ready-stale'));
  });

  it('reports error when the projection is malformed and exposes the canonical code', async () => {
    mockFetchOnce({ items: 'not-an-array' });

    const { result } = renderHook(() => useClaimsList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.viewState).toBe('error'));
    expect(result.current.error?.code).toBe('PROJECTION_MALFORMED');
  });

  it('reports error when the network is unavailable', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useClaimsList(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.viewState).toBe('error'));
    expect(result.current.error?.code).toBe('PROJECTION_UNAVAILABLE');
  });

  it('does not issue a request when params are invalid (fail closed)', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');

    const { result } = renderHook(
      () => useClaimsList({ status: 'NOT_A_STATUS' as never }),
      { wrapper: createWrapper() }
    );

    // Invalid query shapes never reach the wire.
    expect(fetchMock).not.toHaveBeenCalled();
    // Invalid + no data surfaces as loading=false with no fabricated rows.
    expect(result.current.data).toBeUndefined();
  });

  it('builds the query key from canonical params so pages stay cached separately', async () => {
    const envelope = makeEnvelope();
    const fetchMock = mockFetchOnce(envelope);

    renderHook(() => useClaimsList({ page: 2 }), { wrapper: createWrapper() });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((fetchMock.mock.calls[0][0] as string).toString()).toContain('page=2');
  });
});
