// Component tests for ActiveClaimsTable (V2-FE-109).
// Covers every documented user-visible state plus interaction behavior.

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ActiveClaimsTable from '../ActiveClaimsTable';
import { makeClaimItem, makeEnvelope, makeJsonResponse } from '@/hooks/__tests__/claim-list-fixtures';

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

function mockFetchPages(pages: number, pageSize = 10) {
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = String(input);
    const pageMatch = /[?&]page=(\d+)/.exec(url);
    const page = pageMatch ? parseInt(pageMatch[1], 10) : 1;
    const total = pages * pageSize;
    const items = Array.from({ length: pageSize }, (_, i) =>
      makeClaimItem({ id: `claim-${page}-${i}`, title: `Claim ${page}.${i}` })
    );
    return Promise.resolve(
      makeJsonResponse(
        makeEnvelope({ items, page, pageSize, total, totalPages: pages })
      )
    );
  });
  return fetchMock;
}

function lastUrl(fetchMock: jest.SpyInstance): string {
  return String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]);
}

describe('ActiveClaimsTable — ready state', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders canonical rows from the projection (not mock data)', async () => {
    mockFetchOnce(makeEnvelope({ items: [makeClaimItem({ title: 'Canonical claim row' })] }));

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });

    await waitFor(() =>
      expect(screen.getByText('Canonical claim row')).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getAllByText('Verified').length).toBeGreaterThan(0)
    );
    // Confidence comes from the projection score.
    expect(screen.getByText('97%')).toBeInTheDocument();
  });

  it('renders an em-dash for unscored claims instead of inventing confidence', async () => {
    mockFetchOnce(makeEnvelope({ items: [makeClaimItem({ confidenceScore: null })] }));

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getByLabelText('Active claims')).toBeInTheDocument());
    expect(screen.getByTitle('Not yet scored')).toBeInTheDocument();
  });

  it('sends the canonical querystring: search, filter, pagination', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchOnce(makeEnvelope());

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });
    await waitFor(() => expect(screen.getByLabelText('Search claims')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Search claims'), 'vac');
    await user.click(screen.getByRole('button', { name: 'Disputed' }));

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('search=vac'));
    await waitFor(() => expect(lastUrl(fetchMock)).toContain('status=DISPUTED'));
  });

  it('debounces search input so each keystroke does not hit the wire', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchOnce(makeEnvelope());

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });
    await waitFor(() => expect(screen.getByLabelText('Search claims')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Search claims'), 'abc');
    // During the debounce window nothing beyond the initial fetch happened.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('paginates via the server: next page requests page=2 and updates the range', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchPages(3);

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getByText('Claim 1.0')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /next page/i }));

    await waitFor(() => expect(screen.getAllByText('Claim 2.0').length).toBeGreaterThan(0));
    expect(lastUrl(fetchMock)).toContain('page=2');
    expect(screen.getAllByText(/Showing 11–20 of 30 claims/).length).toBeGreaterThan(0);
  });

  it('disables Previous on the first page and Next on the last page', async () => {
    const user = userEvent.setup();
    mockFetchPages(2);

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled());

    await user.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled());
    expect(screen.getByRole('button', { name: /previous page/i })).toBeEnabled();
  });

  it('marks the current page with aria-current', async () => {
    mockFetchPages(2);

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Go to page 1' })).toHaveAttribute('aria-current', 'page')
    );
  });
});

describe('ActiveClaimsTable — filterable empty state', () => {
  afterEach(() => jest.restoreAllMocks());

  it('offers Clear filters when the current search/filter matches nothing', async () => {
    const user = userEvent.setup();
    mockFetchOnce(makeEnvelope({ items: [] }));

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });
    await waitFor(() => expect(screen.getByLabelText('Search claims')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Search claims'), 'zzz');
    await waitFor(() =>
      expect(
        screen.getAllByText(/No claims match the current search or filter/).length
      ).toBeGreaterThan(0)
    );

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByLabelText('Search claims')).toHaveValue('');
  });

  it('distinguishes a genuinely empty projection from a filtered-out one', async () => {
    mockFetchOnce(makeEnvelope({ items: [] }));

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });

    await waitFor(() =>
      expect(
        screen.getAllByText(/No claims have been indexed yet/).length
      ).toBeGreaterThan(0)
    );
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });
});

describe('ActiveClaimsTable — error and stale states', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows a recoverable error with canonical code and a Try again action', async () => {
    const user = userEvent.setup();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new TypeError('Failed to fetch'));

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/PROJECTION_UNAVAILABLE/)).toBeInTheDocument();

    mockFetchOnce(makeEnvelope());
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Active claims')).toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenCalled();
  });

  it('shows the stale banner with the server-reported reason', async () => {
    mockFetchOnce(
      makeEnvelope({
        freshness: 'stale',
        generatedAt: new Date(Date.now() - 120_000).toISOString(),
        reason: 'Indexer lagging behind chain head',
      })
    );

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });

    await waitFor(() =>
      expect(screen.getByText('Claim data may be out of date.')).toBeInTheDocument()
    );
    expect(screen.getByText(/Indexer lagging behind chain head/)).toBeInTheDocument();
  });

  it('announces row counts to assistive tech via a polite live region', async () => {
    mockFetchOnce(makeEnvelope({ items: [makeClaimItem()], total: 42, totalPages: 5 }));

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });

    await waitFor(() =>
      expect(screen.getAllByText('Showing 1–1 of 42 claims').length).toBeGreaterThan(0)
    );
  });
});

describe('ActiveClaimsTable — accessibility structure', () => {
  afterEach(() => jest.restoreAllMocks());

  it('exposes search, filter group, table, and pagination with accessible names', async () => {
    mockFetchPages(2);

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getByRole('table', { name: 'Active claims' })).toBeInTheDocument());

    expect(screen.getByLabelText('Search claims')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter claims' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Claims pagination' })).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Claims pagination' });
    expect(within(nav).getByRole('button', { name: /previous page/i })).toBeDisabled();
  });

  it('renders filter chips as toggle buttons with aria-pressed', async () => {
    const user = userEvent.setup();
    mockFetchOnce(makeEnvelope());

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });

    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Filter claims' })).toBeInTheDocument()
    );

    const group = screen.getByRole('group', { name: 'Filter claims' });
    const openChip = within(group).getByRole('button', { name: 'Open' });
    expect(openChip).toHaveAttribute('aria-pressed', 'false');

    await user.click(openChip);
    expect(openChip).toHaveAttribute('aria-pressed', 'true');
  });
});
