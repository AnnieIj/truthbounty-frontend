// Accessibility checks for the claims list surface (V2-FE-109).
// Runs jest-axe against every user-visible state: loading skeleton, ready,
// empty, stale, and error. Wired into CI via `pnpm test:a11y`.

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ActiveClaimsTable from '@/components/features/ActiveClaimsTable';
import {
  makeClaimItem,
  makeEnvelope,
  makeJsonResponse,
} from '@/hooks/__tests__/claim-list-fixtures';

expect.extend(toHaveNoViolations);

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

function mockFetchOnce(payload: unknown) {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(makeJsonResponse(payload));
}

async function expectNoAxeViolations(container: HTMLElement) {
  const results = await axe(container);
  expect(results).toHaveNoViolations();
}

describe('ActiveClaimsTable accessibility', () => {
  afterEach(() => jest.restoreAllMocks());

  it('loading state (skeleton) has no axe violations', async () => {
    // Keep the fetch pending so the skeleton remains visible.
    jest.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}));

    const { container } = render(<ActiveClaimsTable />, {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(container.querySelector('.animate-shimmer')).not.toBeNull()
    );
    await expectNoAxeViolations(container);
  });

  it('ready state (rows + pagination) has no axe violations', async () => {
    mockFetchOnce(
      makeEnvelope({
        items: [
          makeClaimItem({ id: 'claim-1' }),
          makeClaimItem({ id: 'claim-2', confidenceScore: null, status: 'DISPUTED' }),
        ],
        total: 22,
        totalPages: 3,
      })
    );

    const { container } = render(<ActiveClaimsTable />, {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(container.querySelector('table')).not.toBeNull()
    );
    await expectNoAxeViolations(container);
  });

  it('stale state (banner + rows) has no axe violations', async () => {
    mockFetchOnce(
      makeEnvelope({
        freshness: 'stale',
        generatedAt: new Date(Date.now() - 120_000).toISOString(),
        reason: 'Indexer lagging behind chain head',
      })
    );

    const { container } = render(<ActiveClaimsTable />, {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(container.textContent).toContain('Claim data may be out of date.')
    );
    await expectNoAxeViolations(container);
  });

  it('empty state has no axe violations', async () => {
    mockFetchOnce(makeEnvelope({ items: [] }));

    const { container } = render(<ActiveClaimsTable />, {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(container.textContent).toContain('No claims have been indexed yet')
    );
    // Sanity check: the empty state is the visible one, not only the
    // sr-only announcement.
    expect(container.textContent).not.toContain('No claims match');
    await expectNoAxeViolations(container);
  });

  it('error state (recoverable) has no axe violations', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new TypeError('Failed to fetch'));

    const { container } = render(<ActiveClaimsTable />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    await expectNoAxeViolations(container);
  });
});
