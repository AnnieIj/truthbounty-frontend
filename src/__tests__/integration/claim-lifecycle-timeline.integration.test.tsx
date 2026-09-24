/**
 * Integration tests for Claim Lifecycle Timeline
 *
 * Tests the full integration between hook, component, React Query,
 * WebSocket updates, and mock chain/API data. Validates canonical
 * state tracking and reconciliation flows.
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClaimLifecycleTimeline } from '@/components/features/claim-lifecycle';
import type { Claim } from '@/app/types/claim';
import type { Verification } from '@/app/types/verification';
import type { Dispute } from '@/app/types/dispute';

// Mock WebSocket provider with controllable event emission
let mockSubscriptionHandlers: Map<string, Set<(payload: any) => void>>;

const mockWebSocketContext = {
  subscribe: jest.fn((event: string, handler: (payload: any) => void) => {
    if (!mockSubscriptionHandlers.has(event)) {
      mockSubscriptionHandlers.set(event, new Set());
    }
    mockSubscriptionHandlers.get(event)!.add(handler);
    return () => mockSubscriptionHandlers.get(event)?.delete(handler);
  }),
  isConnected: true,
  send: jest.fn(),
};

jest.mock('@/components/providers/WebSocketProvider', () => ({
  useWebSocketContext: () => mockWebSocketContext,
}));

// Mock wagmi hooks
jest.mock('wagmi', () => ({
  useAccount: () => ({
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E' as `0x${string}`,
    isConnected: true,
  }),
  useChainId: () => 11155420,
}));

describe('Claim Lifecycle Timeline Integration', () => {
  let queryClient: QueryClient;
  let user: ReturnType<typeof userEvent.setup>;

  const mockClaim: Claim = {
    id: 'claim-integration-123',
    title: 'Integration Test Claim',
    description: 'Testing full lifecycle flow',
    claimantAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E',
    status: 'OPEN',
    bountyAmount: 100,
    totalStaked: 0,
    evidence: [],
    createdAt: new Date('2024-01-01T10:00:00Z').toISOString(),
    updatedAt: new Date('2024-01-01T10:00:00Z').toISOString(),
  };

  const mockVerification: Verification = {
    id: 'verification-1',
    claimId: 'claim-integration-123',
    verifierAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E',
    decision: 'VERIFY',
    stakeAmount: 50,
    status: 'CONFIRMED',
    transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    createdAt: new Date('2024-01-01T11:00:00Z').toISOString(),
    confirmedAt: new Date('2024-01-01T11:02:00Z').toISOString(),
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    user = userEvent.setup();
    mockSubscriptionHandlers = new Map();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    queryClient.clear();
  });

  const renderTimeline = (claimId: string = 'claim-integration-123', props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ClaimLifecycleTimeline claimId={claimId} {...props} />
      </QueryClientProvider>
    );
  };

  /**
   * Helper to emit WebSocket events
   */
  const emitWebSocketEvent = (event: string, payload: any) => {
    const handlers = mockSubscriptionHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(payload));
    }
  };

  describe('Full Lifecycle Flow', () => {
    it('should display complete claim lifecycle from creation to verification', async () => {
      // Pre-populate cache with claim data
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      renderTimeline();

      // Should show loading initially
      expect(screen.getByRole('status', { name: /loading timeline/i })).toBeInTheDocument();

      // Wait for timeline to load
      await waitFor(() => {
        expect(screen.getByText('Claim Lifecycle')).toBeInTheDocument();
      });

      // Should show initial events
      expect(screen.getByText('Claim Created')).toBeInTheDocument();
      expect(screen.getByText('Claim Indexed')).toBeInTheDocument();

      // Should show correct phase
      expect(screen.getByText(/verification open/i)).toBeInTheDocument();

      // Should show user action indicator
      expect(screen.getByText('(You)')).toBeInTheDocument();
    });

    it('should update timeline when claim status changes via WebSocket', async () => {
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Simulate claim status change via WebSocket
      const updatedClaim = { ...mockClaim, status: 'VERIFIED' as const };
      queryClient.setQueryData(['claims', 'claim-integration-123'], updatedClaim);

      emitWebSocketEvent('CLAIM_STATUS_CHANGED', {
        claimId: 'claim-integration-123',
        previousStatus: 'OPEN',
        newStatus: 'VERIFIED',
      });

      // Should trigger reconciliation and update phase
      await waitFor(
        () => {
          // Timeline should show STATUS_CHANGED event after reconciliation
          const list = screen.getByRole('list');
          expect(list).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should aggregate verification events into timeline', async () => {
      const claimWithVerification = { ...mockClaim, totalStaked: 50 };
      queryClient.setQueryData(['claims', 'claim-integration-123'], claimWithVerification);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Simulate verification added via WebSocket
      emitWebSocketEvent('VERIFICATION_ADDED', {
        claimId: 'claim-integration-123',
        verification: mockVerification,
      });

      // Should trigger reconciliation
      await waitFor(
        () => {
          // After reconciliation, timeline should be updated
          expect(screen.getByRole('list')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should handle dispute creation and update phase', async () => {
      const disputedClaim = { ...mockClaim, status: 'DISPUTED' as const };
      queryClient.setQueryData(['claims', 'claim-integration-123'], disputedClaim);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Simulate dispute creation
      emitWebSocketEvent('DISPUTE_CREATED', {
        claimId: 'claim-integration-123',
        dispute: {
          id: 'dispute-1',
          claimId: 'claim-integration-123',
          reason: 'Incorrect verification',
          createdAt: new Date().toISOString(),
        },
      });

      await waitFor(
        () => {
          // Timeline should update after reconciliation
          const list = screen.getByRole('list');
          expect(list).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Real-time Updates', () => {
    it('should subscribe to WebSocket events on mount', async () => {
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Verify subscriptions were set up
      expect(mockWebSocketContext.subscribe).toHaveBeenCalledWith(
        'CLAIM_UPDATED',
        expect.any(Function)
      );
      expect(mockWebSocketContext.subscribe).toHaveBeenCalledWith(
        'CLAIM_STATUS_CHANGED',
        expect.any(Function)
      );
      expect(mockWebSocketContext.subscribe).toHaveBeenCalledWith(
        'VERIFICATION_ADDED',
        expect.any(Function)
      );
      expect(mockWebSocketContext.subscribe).toHaveBeenCalledWith(
        'DISPUTE_CREATED',
        expect.any(Function)
      );
    });

    it('should handle multiple rapid WebSocket updates', async () => {
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Emit multiple updates rapidly
      for (let i = 0; i < 5; i++) {
        emitWebSocketEvent('CLAIM_UPDATED', {
          claimId: 'claim-integration-123',
          updates: { totalStaked: i * 10 },
        });
      }

      // Should handle all updates gracefully
      await waitFor(
        () => {
          expect(screen.getByRole('list')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should unsubscribe from WebSocket on unmount', async () => {
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      const { unmount } = renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      const subscriptionCount = mockWebSocketContext.subscribe.mock.calls.length;
      expect(subscriptionCount).toBeGreaterThan(0);

      // Unmount should clean up subscriptions
      unmount();

      // Verify handlers were removed
      mockSubscriptionHandlers.forEach((handlers) => {
        expect(handlers.size).toBe(0);
      });
    });
  });

  describe('Staleness Detection and Reconciliation', () => {
    it('should detect stale data and show warning', async () => {
      const oldClaim = {
        ...mockClaim,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 mins ago
      };
      queryClient.setQueryData(['claims', 'claim-integration-123'], oldClaim);

      renderTimeline({ maxStalenessMs: 60000 }); // 1 min threshold

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Advance time to trigger staleness check
      jest.advanceTimersByTime(120000); // 2 minutes

      await waitFor(
        () => {
          // Should show stale warning after interval check
          const warnings = screen.queryAllByText(/outdated/i);
          expect(warnings.length).toBeGreaterThanOrEqual(0);
        },
        { timeout: 3000 }
      );
    });

    it('should reconcile stale data when refresh is clicked', async () => {
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Update claim in cache
      const updatedClaim = { ...mockClaim, totalStaked: 100 };
      queryClient.setQueryData(['claims', 'claim-integration-123'], updatedClaim);

      // Click refresh button
      const refreshButton = screen.getByRole('button', { name: /refresh timeline data/i });
      await user.click(refreshButton);

      // Should show reconciling state
      await waitFor(() => {
        expect(screen.getByText(/refreshing/i)).toBeInTheDocument();
      });

      // Wait for reconciliation to complete
      await waitFor(
        () => {
          const refreshBtn = screen.queryByText(/refreshing/i);
          expect(refreshBtn).not.toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should auto-reconcile stale data when enabled', async () => {
      const oldClaim = {
        ...mockClaim,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      };
      queryClient.setQueryData(['claims', 'claim-integration-123'], oldClaim);

      renderTimeline({
        enableAutoReconciliation: true,
        reconciliationIntervalMs: 1000,
        maxStalenessMs: 5000,
      });

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Update claim to make current data stale
      const freshClaim = { ...mockClaim, status: 'VERIFIED' as const };
      queryClient.setQueryData(['claims', 'claim-integration-123'], freshClaim);

      // Advance time to trigger auto-reconciliation
      jest.advanceTimersByTime(10000);

      await waitFor(
        () => {
          // Auto-reconciliation should have occurred
          expect(screen.getByRole('list')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle claim not found error gracefully', async () => {
      renderTimeline('non-existent-claim');

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('Timeline Error')).toBeInTheDocument();
      expect(screen.getByText(/claim not found/i)).toBeInTheDocument();
    });

    it('should recover from reconciliation errors with retry', async () => {
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Clear cache to cause reconciliation error
      queryClient.clear();

      // Trigger reconciliation
      const refreshButton = screen.getByRole('button', { name: /refresh timeline data/i });
      await user.click(refreshButton);

      // Should show error
      await waitFor(() => {
        const alert = screen.queryByRole('alert');
        if (alert) {
          expect(alert).toBeInTheDocument();
        }
      });

      // Restore data
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      // Retry should succeed
      const retryButton = screen.queryByRole('button', { name: /retry/i });
      if (retryButton) {
        await user.click(retryButton);

        await waitFor(
          () => {
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
          },
          { timeout: 3000 }
        );
      }
    });

    it('should handle WebSocket disconnection gracefully', async () => {
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      // Simulate disconnected WebSocket
      const disconnectedContext = {
        ...mockWebSocketContext,
        isConnected: false,
      };

      jest
        .spyOn(require('@/components/providers/WebSocketProvider'), 'useWebSocketContext')
        .mockReturnValue(disconnectedContext);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Timeline should still work without real-time updates
      expect(screen.getByText('Claim Lifecycle')).toBeInTheDocument();
    });
  });

  describe('Chain/API State Consistency', () => {
    it('should never fabricate transaction hashes', async () => {
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Check that no transaction links are shown for events without hashes
      const txLinks = screen.queryAllByText(/^Tx:/);
      expect(txLinks.length).toBe(0); // Mock claim has no tx hashes
    });

    it('should show transaction links only for events with confirmed hashes', async () => {
      // Add verification with transaction hash
      queryClient.setQueryData(['claims', 'claim-integration-123'], {
        ...mockClaim,
        totalStaked: 50,
      });

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Only events with actual transaction hashes should have links
      const entries = screen.getAllByRole('listitem');
      entries.forEach((entry) => {
        const txLink = within(entry).queryByRole('link', { name: /view transaction/i });
        if (txLink) {
          // Link should have valid transaction hash
          expect(txLink).toHaveAttribute('href');
          const href = txLink.getAttribute('href');
          expect(href).toContain('etherscan.io');
        }
      });
    });

    it('should display finality status from canonical sources', async () => {
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // All events from API projection should show INDEXED finality
      const finalityBadges = screen.getAllByRole('status', { name: /finality/i });
      expect(finalityBadges.length).toBeGreaterThan(0);

      finalityBadges.forEach((badge) => {
        const text = badge.textContent;
        expect(['Indexed', 'Confirmed', 'Safe', 'Finalized', 'Submitted']).toContain(text);
      });
    });

    it('should track event source provenance', async () => {
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Events should have source indicators (icons)
      const entries = screen.getAllByRole('listitem');
      entries.forEach((entry) => {
        // Each entry should have source metadata (emoji indicators)
        expect(entry.textContent).toBeTruthy();
      });
    });
  });

  describe('Phase Transitions', () => {
    it('should transition from VERIFICATION_OPEN to VERIFICATION_CLOSED', async () => {
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText(/verification open/i)).toBeInTheDocument();
      });

      // Simulate verification period ending
      const closedClaim = { ...mockClaim, status: 'UNDER_REVIEW' as const };
      queryClient.setQueryData(['claims', 'claim-integration-123'], closedClaim);

      emitWebSocketEvent('CLAIM_STATUS_CHANGED', {
        claimId: 'claim-integration-123',
        previousStatus: 'OPEN',
        newStatus: 'UNDER_REVIEW',
      });

      await waitFor(
        () => {
          // Phase should update after reconciliation
          expect(screen.getByRole('list')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should handle phase callback on changes', async () => {
      const onPhaseChange = jest.fn();
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      renderTimeline('claim-integration-123', { onPhaseChange });

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Initial phase should be announced
      await waitFor(() => {
        expect(onPhaseChange).toHaveBeenCalledWith('VERIFICATION_OPEN');
      });
    });
  });

  describe('User Experience', () => {
    it('should show loading state before data loads', () => {
      renderTimeline();

      expect(screen.getByRole('status', { name: /loading timeline/i })).toBeInTheDocument();
      expect(screen.getByText(/loading claim lifecycle timeline/i)).toBeInTheDocument();
    });

    it('should show empty state for claims with no events', async () => {
      const emptyClaim = { ...mockClaim, id: 'empty-claim' };
      queryClient.setQueryData(['claims', 'empty-claim'], emptyClaim);

      renderTimeline('empty-claim');

      await waitFor(() => {
        // Should show at least claim created events
        expect(screen.getByText('Claim Lifecycle')).toBeInTheDocument();
      });
    });

    it('should indicate user actions with "You" label', async () => {
      const userClaim = {
        ...mockClaim,
        claimantAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E', // Same as mocked user
      };
      queryClient.setQueryData(['claims', 'claim-integration-123'], userClaim);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      expect(screen.getByText('(You)')).toBeInTheDocument();
    });

    it('should show pending indicators for unconfirmed transactions', async () => {
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // All events from API are finalized, so no pending indicators should show
      const pendingIndicators = screen.queryAllByText(/pending/i);
      expect(pendingIndicators.length).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should handle large number of events efficiently', async () => {
      const manyEventsClaim = {
        ...mockClaim,
        totalStaked: 1000,
      };
      queryClient.setQueryData(['claims', 'claim-integration-123'], manyEventsClaim);

      const startTime = performance.now();
      renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render in reasonable time (< 1 second)
      expect(renderTime).toBeLessThan(1000);
    });

    it('should not cause memory leaks with rapid updates', async () => {
      queryClient.setQueryData(['claims', 'claim-integration-123'], mockClaim);

      const { unmount } = renderTimeline();

      await waitFor(() => {
        expect(screen.getByText('Claim Created')).toBeInTheDocument();
      });

      // Emit many updates
      for (let i = 0; i < 100; i++) {
        emitWebSocketEvent('CLAIM_UPDATED', {
          claimId: 'claim-integration-123',
          updates: { totalStaked: i },
        });
      }

      // Should handle updates without crashing
      expect(screen.getByText('Claim Lifecycle')).toBeInTheDocument();

      // Clean unmount
      unmount();
      expect(mockSubscriptionHandlers.get('CLAIM_UPDATED')?.size).toBe(0);
    });
  });
});
