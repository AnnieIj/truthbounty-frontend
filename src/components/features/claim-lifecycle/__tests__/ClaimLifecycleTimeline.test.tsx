/**
 * Unit tests for ClaimLifecycleTimeline component
 *
 * Tests all visual states, accessibility, user interactions,
 * and error handling.
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClaimLifecycleTimeline } from '../ClaimLifecycleTimeline';
import type { Claim } from '@/app/types/claim';

// Mock the hook
const mockTimeline = {
  claimId: 'claim-123',
  currentPhase: 'VERIFICATION_OPEN' as const,
  events: [
    {
      id: 'event-1',
      type: 'CLAIM_CREATED' as const,
      source: 'API_PROJECTION' as const,
      finality: 'INDEXED' as const,
      timestamp: Date.now() - 3600000,
      actor: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E' as `0x${string}`,
      metadata: {
        claimId: 'claim-123',
        claimant: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E' as `0x${string}`,
        contentDigest: '0xabc',
        bountyAmount: '100',
        bountyToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        artifactVersion: '2.0.0',
      },
    },
    {
      id: 'event-2',
      type: 'CLAIM_INDEXED' as const,
      source: 'API_PROJECTION' as const,
      finality: 'INDEXED' as const,
      timestamp: Date.now() - 3500000,
      metadata: {
        claimId: 'claim-123',
        indexedAt: Date.now() - 3500000,
        indexerVersion: '2.0.0',
      },
    },
  ],
  entries: [
    {
      event: {
        id: 'event-1',
        type: 'CLAIM_CREATED' as const,
        source: 'API_PROJECTION' as const,
        finality: 'INDEXED' as const,
        timestamp: Date.now() - 3600000,
        actor: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E' as `0x${string}`,
        metadata: {},
      },
      title: 'Claim Created',
      description: 'Claim submitted to the blockchain',
      severity: 'info' as const,
      isUserAction: true,
      isPending: false,
      isStale: false,
      canReconcile: false,
    },
    {
      event: {
        id: 'event-2',
        type: 'CLAIM_INDEXED' as const,
        source: 'API_PROJECTION' as const,
        finality: 'INDEXED' as const,
        timestamp: Date.now() - 3500000,
        metadata: {},
      },
      title: 'Claim Indexed',
      description: 'Claim processed by the indexer',
      severity: 'success' as const,
      isUserAction: false,
      isPending: false,
      isStale: false,
      canReconcile: false,
    },
  ],
  lastUpdated: Date.now(),
  staleness: {
    isStale: false,
  },
  finality: {
    allEventsFinalized: true,
    pendingConfirmations: 0,
  },
  reconciliation: {
    isReconciling: false,
    failureCount: 0,
  },
};

const mockUseClaimLifecycleTimeline = jest.fn();

jest.mock('@/hooks/useClaimLifecycleTimeline', () => ({
  useClaimLifecycleTimeline: (...args: any[]) => mockUseClaimLifecycleTimeline(...args),
}));

describe('ClaimLifecycleTimeline Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockUseClaimLifecycleTimeline.mockReturnValue({
      timeline: mockTimeline,
      isLoading: false,
      isError: false,
      error: null,
      isStale: false,
      reconcile: jest.fn(),
      isReconciling: false,
      lastReconciled: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ClaimLifecycleTimeline claimId="claim-123" {...props} />
      </QueryClientProvider>
    );
  };

  describe('Loading State', () => {
    it('should display loading skeleton', () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: null,
        isLoading: true,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      renderComponent();

      expect(screen.getByRole('status', { name: /loading timeline/i })).toBeInTheDocument();
      expect(screen.getByText(/loading claim lifecycle timeline/i)).toBeInTheDocument();
    });

    it('should have accessible loading state', () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: null,
        isLoading: true,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      renderComponent();

      const loadingContainer = screen.getByRole('status');
      expect(loadingContainer).toHaveAttribute('aria-busy', 'true');
      expect(loadingContainer).toHaveAttribute('aria-label', 'Loading timeline');
    });
  });

  describe('Error State', () => {
    it('should display error message', () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: null,
        isLoading: false,
        isError: true,
        error: {
          code: 'CLAIM_NOT_FOUND',
          message: 'Claim not found',
          recoverable: true,
          retryAfterMs: 3000,
        },
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      renderComponent();

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Timeline Error')).toBeInTheDocument();
      expect(screen.getByText('Claim not found')).toBeInTheDocument();
    });

    it('should show retry button for recoverable errors', async () => {
      const reconcileMock = jest.fn();
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: null,
        isLoading: false,
        isError: true,
        error: {
          code: 'RECONCILIATION_MISMATCH',
          message: 'State mismatch detected',
          recoverable: true,
          retryAfterMs: 5000,
        },
        isStale: false,
        reconcile: reconcileMock,
        isReconciling: false,
        lastReconciled: null,
      });

      const user = userEvent.setup();
      renderComponent();

      const retryButton = screen.getByRole('button', { name: /retry loading timeline/i });
      expect(retryButton).toBeInTheDocument();

      await user.click(retryButton);
      expect(reconcileMock).toHaveBeenCalledTimes(1);
    });

    it('should have assertive aria-live for errors', () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: null,
        isLoading: false,
        isError: true,
        error: {
          code: 'CHAIN_QUERY_FAILED',
          message: 'Failed to query chain',
          recoverable: false,
        },
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      renderComponent();

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });
  });

  describe('Empty State', () => {
    it('should display empty state message', () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: { ...mockTimeline, events: [], entries: [] },
        isLoading: false,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      renderComponent();

      expect(screen.getByText('No Timeline Events')).toBeInTheDocument();
      expect(
        screen.getByText(/no lifecycle events found for this claim/i)
      ).toBeInTheDocument();
    });
  });

  describe('Success State', () => {
    it('should render timeline with events', () => {
      renderComponent();

      expect(screen.getByText('Claim Lifecycle')).toBeInTheDocument();
      expect(screen.getByText('Claim Created')).toBeInTheDocument();
      expect(screen.getByText('Claim Indexed')).toBeInTheDocument();
    });

    it('should display phase indicator', () => {
      renderComponent();

      expect(screen.getByRole('status', { name: /current phase/i })).toBeInTheDocument();
      expect(screen.getByText(/verification open/i)).toBeInTheDocument();
    });

    it('should show refresh button', () => {
      renderComponent();

      expect(screen.getByRole('button', { name: /refresh timeline data/i })).toBeInTheDocument();
    });

    it('should mark user actions', () => {
      renderComponent();

      expect(screen.getByText('(You)')).toBeInTheDocument();
    });

    it('should display finality badges', () => {
      renderComponent();

      const badges = screen.getAllByRole('status', { name: /finality/i });
      expect(badges.length).toBeGreaterThan(0);
    });

    it('should show timestamps', () => {
      renderComponent();

      const times = screen.getAllByRole('time');
      expect(times.length).toBe(mockTimeline.entries.length);
    });
  });

  describe('Stale State', () => {
    it('should display stale warning banner', () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: {
          ...mockTimeline,
          staleness: {
            isStale: true,
            reason: 'Data may be outdated',
          },
        },
        isLoading: false,
        isError: false,
        error: null,
        isStale: true,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: Date.now() - 120000, // 2 mins ago
      });

      renderComponent();

      expect(screen.getByText('Timeline Data May Be Outdated')).toBeInTheDocument();
      expect(screen.getByText(/data may be outdated/i)).toBeInTheDocument();
    });

    it('should show time since last reconciliation', () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: {
          ...mockTimeline,
          staleness: {
            isStale: true,
            reason: 'Data may be outdated',
          },
        },
        isLoading: false,
        isError: false,
        error: null,
        isStale: true,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: Date.now() - 180000, // 3 mins ago
      });

      renderComponent();

      expect(screen.getByText(/last updated/i)).toBeInTheDocument();
    });

    it('should highlight stale events', () => {
      const staleEntry = {
        ...mockTimeline.entries[0],
        isStale: true,
      };

      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: {
          ...mockTimeline,
          entries: [staleEntry, mockTimeline.entries[1]],
          staleness: {
            isStale: true,
          },
        },
        isLoading: false,
        isError: false,
        error: null,
        isStale: true,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      renderComponent();

      expect(screen.getByText('⚠️ Stale')).toBeInTheDocument();
    });
  });

  describe('Pending State', () => {
    it('should show pending indicators for unconfirmed events', () => {
      const pendingEntry = {
        ...mockTimeline.entries[0],
        isPending: true,
      };

      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: {
          ...mockTimeline,
          entries: [pendingEntry, mockTimeline.entries[1]],
          finality: {
            ...mockTimeline.finality,
            pendingConfirmations: 1,
          },
        },
        isLoading: false,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      renderComponent();

      expect(screen.getByText('⏳ Pending')).toBeInTheDocument();
      expect(screen.getByText('(1 pending)')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('should call reconcile when refresh button is clicked', async () => {
      const reconcileMock = jest.fn();
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: mockTimeline,
        isLoading: false,
        isError: false,
        error: null,
        isStale: false,
        reconcile: reconcileMock,
        isReconciling: false,
        lastReconciled: null,
      });

      const user = userEvent.setup();
      renderComponent();

      const refreshButton = screen.getByRole('button', { name: /refresh timeline data/i });
      await user.click(refreshButton);

      expect(reconcileMock).toHaveBeenCalledTimes(1);
    });

    it('should disable refresh button when reconciling', () => {
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: mockTimeline,
        isLoading: false,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: true,
        lastReconciled: null,
      });

      renderComponent();

      const refreshButton = screen.getByRole('button', { name: /refreshing timeline data/i });
      expect(refreshButton).toBeDisabled();
      expect(screen.getByText('Refreshing...')).toBeInTheDocument();
    });

    it('should call onPhaseChange callback when phase changes', () => {
      const onPhaseChangeMock = jest.fn();
      const { rerender } = renderComponent({ onPhaseChange: onPhaseChangeMock });

      // Change phase
      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: { ...mockTimeline, currentPhase: 'VERIFICATION_CLOSED' },
        isLoading: false,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      rerender(
        <QueryClientProvider client={queryClient}>
          <ClaimLifecycleTimeline claimId="claim-123" onPhaseChange={onPhaseChangeMock} />
        </QueryClientProvider>
      );

      waitFor(() => {
        expect(onPhaseChangeMock).toHaveBeenCalledWith('VERIFICATION_CLOSED');
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      renderComponent();

      expect(screen.getByRole('list', { name: /claim lifecycle/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/current phase/i)).toBeInTheDocument();
    });

    it('should have live region for announcements', () => {
      renderComponent();

      const liveRegions = document.querySelectorAll('[role="status"][aria-live="polite"]');
      expect(liveRegions.length).toBeGreaterThan(0);
    });

    it('should have accessible timeline entries', () => {
      renderComponent();

      const entries = screen.getAllByRole('listitem');
      expect(entries.length).toBe(mockTimeline.entries.length);

      entries.forEach((entry) => {
        expect(entry).toHaveAttribute('aria-label');
      });
    });

    it('should have accessible transaction links', () => {
      const entryWithTx = {
        ...mockTimeline.entries[0],
        event: {
          ...mockTimeline.entries[0].event,
          transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      };

      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: {
          ...mockTimeline,
          entries: [entryWithTx, mockTimeline.entries[1]],
        },
        isLoading: false,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      renderComponent();

      const txLink = screen.getByRole('link', { name: /view transaction/i });
      expect(txLink).toHaveAttribute('target', '_blank');
      expect(txLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderComponent();

      const refreshButton = screen.getByRole('button', { name: /refresh timeline data/i });

      // Tab to button
      await user.tab();
      expect(refreshButton).toHaveFocus();

      // Press Enter
      await user.keyboard('{Enter}');
      expect(mockUseClaimLifecycleTimeline().reconcile).toHaveBeenCalled();
    });
  });

  describe('Responsive Behavior', () => {
    it('should support compact mode', () => {
      renderComponent({ compact: true });

      // Compact mode should still render all content
      expect(screen.getByText('Claim Lifecycle')).toBeInTheDocument();
      expect(screen.getByText('Claim Created')).toBeInTheDocument();
    });

    it('should hide reconcile button when showReconcileButton is false', () => {
      renderComponent({ showReconcileButton: false });

      expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument();
    });
  });

  describe('Configuration', () => {
    it('should pass configuration to hook', () => {
      renderComponent({
        enableRealtime: false,
        enableAutoReconciliation: false,
        maxStalenessMs: 10000,
      });

      expect(mockUseClaimLifecycleTimeline).toHaveBeenCalledWith(
        expect.objectContaining({
          claimId: 'claim-123',
          enableRealtime: false,
          enableAutoReconciliation: false,
          maxStalenessMs: 10000,
        })
      );
    });
  });

  describe('Visual States', () => {
    it('should render phase indicator with correct styling', () => {
      renderComponent();

      const phaseIndicator = screen.getByText(/verification open/i);
      expect(phaseIndicator.parentElement).toHaveClass('inline-flex');
    });

    it('should render finality badges with correct colors', () => {
      renderComponent();

      const badges = screen.getAllByRole('status', { name: /finality/i });
      badges.forEach((badge) => {
        expect(badge).toHaveClass('rounded-full');
      });
    });

    it('should render severity colors correctly', () => {
      const entries = [
        {
          ...mockTimeline.entries[0],
          severity: 'success' as const,
          title: 'Success Event',
        },
        {
          ...mockTimeline.entries[1],
          severity: 'error' as const,
          title: 'Error Event',
        },
      ];

      mockUseClaimLifecycleTimeline.mockReturnValue({
        timeline: { ...mockTimeline, entries },
        isLoading: false,
        isError: false,
        error: null,
        isStale: false,
        reconcile: jest.fn(),
        isReconciling: false,
        lastReconciled: null,
      });

      renderComponent();

      expect(screen.getByText('Success Event')).toBeInTheDocument();
      expect(screen.getByText('Error Event')).toBeInTheDocument();
    });
  });
});
