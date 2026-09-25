/**
 * Search input clear-button invariants for ActiveClaimsTable.
 *
 * Audit finding: "Input clear button missing → Fix: Add 'X' to search."
 *
 * Invariants enforced here:
 *   1. The clear button is hidden when the search input is empty.
 *      (Showing an X for an empty field is a usability anti-pattern.)
 *   2. Once the user types a value, an X button with an accessible
 *      name "Clear search" appears next to the input.
 *   3. Clicking the X clears the input value.
 *   4. After clearing, focus returns to the search input so keyboard
 *      users do not lose their place.
 *
 * Updated for V2-FE-109: the table now renders the canonical claims list
 * projection (React Query), so tests wrap in a QueryClientProvider, mock the
 * projection endpoint, and await async rendering. The invariants are unchanged.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ActiveClaimsTable from '@/components/features/ActiveClaimsTable';
import {
  makeClaimItem,
  makeEnvelope,
  makeJsonResponse,
} from '@/hooks/__tests__/claim-list-fixtures';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function mockFetchEnvelope(payload: unknown) {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(makeJsonResponse(payload));
}

describe('ActiveClaimsTable — search clear button', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not render the clear button when the search input is empty', async () => {
    mockFetchEnvelope(makeEnvelope());

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });

    // Wait for the canonical projection to arrive; the clear button must
    // stay hidden the whole time.
    await waitFor(() =>
      expect(screen.getByLabelText(/active claims/i)).toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', { name: /clear search/i })
    ).not.toBeInTheDocument();
  });

  it('renders the clear button after the user types into the search input', async () => {
    mockFetchEnvelope(makeEnvelope());

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByLabelText(/search claims/i)).toBeInTheDocument()
    );

    const searchInput = screen.getByLabelText(/search claims/i) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'climate' } });

    expect(searchInput.value).toBe('climate');
    expect(
      screen.getByRole('button', { name: /clear search/i })
    ).toBeInTheDocument();
  });

  it('clicking the clear button empties the input and re-focuses it', async () => {
    mockFetchEnvelope(makeEnvelope());

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByLabelText(/search claims/i)).toBeInTheDocument()
    );

    const searchInput = screen.getByLabelText(/search claims/i) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'climate' } });

    const clearBtn = screen.getByRole('button', { name: /clear search/i });
    fireEvent.click(clearBtn);

    expect(searchInput.value).toBe('');
    // After clearing, the X disappears (invariant #1) and focus is returned
    // to the input (invariant #4).
    expect(
      screen.queryByRole('button', { name: /clear search/i })
    ).not.toBeInTheDocument();
    expect(document.activeElement).toBe(searchInput);
  });

  it('renders a friendly empty state when the filter yields no indexed claims', async () => {
    mockFetchEnvelope(makeEnvelope({ items: [] }));

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /disputed/i })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: /disputed/i }));

    // Filtering the full canonical projection down to an empty result set
    // is presented as the indexed-empty guidance (server owns the filtering).
    await waitFor(() =>
      expect(
        screen.getAllByText(/no claims match the current search or filter/i).length
      ).toBeGreaterThan(0)
    );
  });

  it('renders a friendly empty state when the search yields no results', async () => {
    mockFetchEnvelope(makeEnvelope({ items: [] }));

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByLabelText(/search claims/i)).toBeInTheDocument()
    );

    const searchInput = screen.getByLabelText(/search claims/i) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'impossible-text' } });

    await waitFor(() =>
      expect(
        screen.getAllByText(/no claims match the current search or filter/i).length
      ).toBeGreaterThan(0)
    );
  });

  it('clear button has type="button" so it never submits an enclosing form', async () => {
    mockFetchEnvelope(makeEnvelope());

    render(<ActiveClaimsTable />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByLabelText(/search claims/i)).toBeInTheDocument()
    );

    const searchInput = screen.getByLabelText(/search claims/i);
    fireEvent.change(searchInput, { target: { value: 'x' } });

    const clearBtn = screen.getByRole('button', {
      name: /clear search/i,
    }) as HTMLButtonElement;
    expect(clearBtn.type).toBe('button');
  });
});
