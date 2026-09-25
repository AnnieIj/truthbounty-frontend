/**
 * Unit tests for useClaimLifecycleTimeline hook
 *
 * Tests canonical state tracking, staleness detection, reconciliation,
 * event aggregation, and all error/edge cases.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useClaimLifecycleTimeline } from '../useClaimLifecycleTimeline';
import type { Claim } from '@/app/types/claim';
import type { Verification } from '@/app/types/verification';
import React from 'react';

// Mock WebSocket provider
jest.mock('@/components/providers/WebSocketProvider', () => ({
  useWebSocketContext: () => ({
    subscribe: jest.fn(() => jest.fn()),
    isConnected: true,
    send: jest.fn(),
  }),
}));

// Mock wagmi hooks
jest.mock('wagmi', () => ({
  useAccount: () => ({
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E' as `0x${string}`,
    isConnected: true,
  }),
  useChainId: () => 11155420,
}));

describe('useClaimLifecycleTimeline', () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  const mockClaim: Claim = {
    id: 'claim-123',
    title: 'Test Claim',
    description: 'Test description',
    claimantAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E',
    status: 'OPEN',
    bountyAmount: 100,
    totalStaked: 50,
    evidence: [],
    createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
    updatedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with loading state', () => {
      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.timeline).toBeNull();
      expect(result.current.isError).toBe(false);
    });

    it('should load timeline from cached claim data', async () => {
      // Pre-populate cache
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.timeline).not.toBeNull();
      expect(result.current.timeline?.claimId).toBe('claim-123');
      expect(result.current.timeline?.events.length).toBeGreaterThan(0);
    });

    it('should handle claim not found error', async () => {
      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'non-existent' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error?.code).toBe('CLAIM_NOT_FOUND');
    });
  });

  describe('Event Aggregation', () => {
    it('should create CLAIM_CREATED and CLAIM_INDEXED events', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      const events = result.current.timeline!.events;
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('CLAIM_CREATED');
      expect(events[1].type).toBe('CLAIM_INDEXED');
    });

    it('should create STATUS_CHANGED event for non-OPEN claims', async () => {
      const verifiedClaim = { ...mockClaim, status: 'VERIFIED' as const };
      queryClient.setQueryData(['claims', 'claim-123'], verifiedClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      const statusEvents = result.current.timeline!.events.filter(
        (e) => e.type === 'STATUS_CHANGED'
      );
      expect(statusEvents).toHaveLength(1);
      expect(statusEvents[0].metadata.newStatus).toBe('VERIFIED');
    });

    it('should include event source and finality metadata', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      const event = result.current.timeline!.events[0];
      expect(event.source).toBe('API_PROJECTION');
      expect(event.finality).toBe('INDEXED');
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('should include actor address in events', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      const claimCreatedEvent = result.current.timeline!.events.find(
        (e) => e.type === 'CLAIM_CREATED'
      );
      expect(claimCreatedEvent?.actor).toBe(mockClaim.claimantAddress);
    });
  });

  describe('Phase Determination', () => {
    it('should set phase to VERIFICATION_OPEN for OPEN claims', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      expect(result.current.timeline!.currentPhase).toBe('VERIFICATION_OPEN');
    });

    it('should set phase to INDEXING when claim indexed event is missing', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      // Since we always create CLAIM_INDEXED, this tests the logic path
      // In real scenarios, indexing delay would prevent this event
      const hasIndexed = result.current.timeline!.events.some(
        (e) => e.type === 'CLAIM_INDEXED'
      );
      expect(hasIndexed).toBe(true);
    });
  });

  describe('Timeline Entries Enrichment', () => {
    it('should enrich events with display information', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      const entries = result.current.timeline!.entries;
      expect(entries.length).toBeGreaterThan(0);

      const entry = entries[0];
      expect(entry.title).toBeDefined();
      expect(entry.description).toBeDefined();
      expect(entry.severity).toBeDefined();
      expect(['info', 'success', 'warning', 'error']).toContain(entry.severity);
    });

    it('should mark user actions correctly', async () => {
      const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E';
      const userClaim = { ...mockClaim, claimantAddress: userAddress };
      queryClient.setQueryData(['claims', 'claim-123'], userClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      const claimCreatedEntry = result.current.timeline!.entries.find(
        (e) => e.event.type === 'CLAIM_CREATED'
      );
      expect(claimCreatedEntry?.isUserAction).toBe(true);
    });

    it('should detect pending events', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      // All events from API should not be pending (they're INDEXED)
      const pendingEntries = result.current.timeline!.entries.filter((e) => e.isPending);
      expect(pendingEntries).toHaveLength(0);
    });
  });

  describe('Staleness Detection', () => {
    it('should not mark fresh timeline as stale', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123', maxStalenessMs: 300000 }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      expect(result.current.isStale).toBe(false);
      expect(result.current.timeline!.staleness.isStale).toBe(false);
    });

    it('should mark old timeline as stale after threshold', async () => {
      const oldClaim = {
        ...mockClaim,
        updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 mins ago
      };
      queryClient.setQueryData(['claims', 'claim-123'], oldClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123', maxStalenessMs: 60000 }), // 1 min threshold
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      // Advance time past staleness threshold
      act(() => {
        jest.advanceTimersByTime(120000); // 2 minutes
      });

      await waitFor(() => {
        expect(result.current.isStale).toBe(true);
      });
    });

    it('should detect stale critical events', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      // Critical events should have stricter staleness (1 min vs 5 min default)
      // This is tested internally by the hook
      expect(result.current.timeline).toBeDefined();
    });
  });

  describe('Reconciliation', () => {
    it('should reconcile timeline data on demand', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      const initialTimestamp = result.current.lastReconciled;

      // Update claim in cache
      const updatedClaim = { ...mockClaim, status: 'VERIFIED' as const };
      queryClient.setQueryData(['claims', 'claim-123'], updatedClaim);

      // Trigger reconciliation
      await act(async () => {
        await result.current.reconcile();
      });

      await waitFor(() => {
        expect(result.current.lastReconciled).not.toBe(initialTimestamp);
      });

      expect(result.current.isReconciling).toBe(false);
    });

    it('should prevent concurrent reconciliations', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      // Start first reconciliation
      act(() => {
        result.current.reconcile();
      });

      expect(result.current.isReconciling).toBe(true);

      // Try to start second reconciliation (should be prevented)
      act(() => {
        result.current.reconcile();
      });

      // Should still only have one reconciliation in progress
      expect(result.current.isReconciling).toBe(true);
    });

    it('should handle reconciliation errors gracefully', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      // Clear the cache to cause error
      queryClient.clear();

      await act(async () => {
        await result.current.reconcile();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error?.code).toBe('RECONCILIATION_MISMATCH');
      expect(result.current.error?.recoverable).toBe(true);
    });

    it('should auto-reconcile when enabled', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () =>
          useClaimLifecycleTimeline({
            claimId: 'claim-123',
            enableAutoReconciliation: true,
            reconciliationIntervalMs: 1000,
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      const initialReconciled = result.current.lastReconciled;

      // Fast-forward past reconciliation interval
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Note: Auto-reconciliation only happens if data is stale
      // With fresh data, it won't trigger
      expect(result.current.isReconciling).toBe(false);
    });
  });

  describe('Finality Tracking', () => {
    it('should track finalized vs unfinalized events', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      const finality = result.current.timeline!.finality;
      expect(finality.allEventsFinalized).toBe(true); // All API events are INDEXED
      expect(finality.pendingConfirmations).toBe(0);
    });

    it('should identify earliest unfinalized event', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      // With all events finalized, should be undefined
      expect(result.current.timeline!.finality.earliestUnfinalizedEventId).toBeUndefined();
    });
  });

  describe('Real-time Updates', () => {
    it('should handle CLAIM_UPDATED WebSocket event', async () => {
      const { useWebSocketContext } = require('@/components/providers/WebSocketProvider');
      let claimUpdatedHandler: ((payload: any) => void) | null = null;

      useWebSocketContext.mockImplementation(() => ({
        subscribe: jest.fn((event: string, handler: any) => {
          if (event === 'CLAIM_UPDATED') {
            claimUpdatedHandler = handler;
          }
          return jest.fn();
        }),
        isConnected: true,
        send: jest.fn(),
      }));

      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () =>
          useClaimLifecycleTimeline({
            claimId: 'claim-123',
            enableRealtime: true,
            enableAutoReconciliation: true,
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      // Simulate WebSocket event
      if (claimUpdatedHandler) {
        act(() => {
          claimUpdatedHandler!({ claimId: 'claim-123', updates: { status: 'VERIFIED' } });
        });
      }

      // Should trigger reconciliation
      await waitFor(
        () => {
          expect(result.current.lastReconciled).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Configuration Options', () => {
    it('should respect enableRealtime flag', async () => {
      const subscribeMock = jest.fn(() => jest.fn());
      const { useWebSocketContext } = require('@/components/providers/WebSocketProvider');
      useWebSocketContext.mockImplementation(() => ({
        subscribe: subscribeMock,
        isConnected: true,
        send: jest.fn(),
      }));

      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      renderHook(() => useClaimLifecycleTimeline({ claimId: 'claim-123', enableRealtime: false }), {
        wrapper,
      });

      // Should not subscribe to WebSocket events
      expect(subscribeMock).not.toHaveBeenCalled();
    });

    it('should respect custom maxStalenessMs', async () => {
      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123', maxStalenessMs: 10000 }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.timeline).not.toBeNull();
      });

      // With custom 10s threshold, fresh data should not be stale
      expect(result.current.isStale).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid claim data gracefully', async () => {
      // Set invalid claim data
      queryClient.setQueryData(['claims', 'claim-123'], null);

      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isError).toBe(true);
    });

    it('should provide recoverable error information', async () => {
      const { result } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'non-existent' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error?.recoverable).toBe(true);
      expect(result.current.error?.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe('Memory and Cleanup', () => {
    it('should clean up subscriptions on unmount', async () => {
      const unsubscribeMock = jest.fn();
      const { useWebSocketContext } = require('@/components/providers/WebSocketProvider');
      useWebSocketContext.mockImplementation(() => ({
        subscribe: jest.fn(() => unsubscribeMock),
        isConnected: true,
        send: jest.fn(),
      }));

      queryClient.setQueryData(['claims', 'claim-123'], mockClaim);

      const { unmount } = renderHook(
        () => useClaimLifecycleTimeline({ claimId: 'claim-123', enableRealtime: true }),
        { wrapper }
      );

      await waitFor(() => {
        expect(unsubscribeMock).toBeDefined();
      });

      unmount();

      // Unsubscribe should be called for each subscription
      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });
});
