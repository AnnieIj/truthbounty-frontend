/**
 * V2-FE-144 — Tests for the useReorgReconciliation hook.
 *
 * Uses a controllable mock of the WebSocket context (captor for typed
 * subscriptions) plus a real QueryClient to verify cache invalidation.
 *
 * Coverage:
 *  - ROLLBACK: marks reorged, invalidates all projection roots, clears the
 *    persisted cursor, fires onReorgReconciled
 *  - REPLACEMENT: scoped invalidation, replacement banner with both hashes
 *  - Malformed events: fail closed (stale-marking invalidation + error),
 *    tracked transaction untouched
 *  - acknowledge() hides the banner
 *  - Subscriptions are dropped on unmount / disconnect (no leaks)
 *  - No fabricated state: banner hidden until a canonical event arrives
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WebSocketEventType } from '@/app/types/websocket';

type Handler = (payload: unknown) => void;

const mockUnsubscribe = jest.fn();
const handlers = new Map<WebSocketEventType, Set<Handler>>();
let mockIsConnected = true;

const mockClearPersistedCursor = jest.fn();

jest.mock('@/components/providers/WebSocketProvider', () => ({
  useWebSocketContext: () => ({
    subscribe: jest.fn((eventType: WebSocketEventType, handler: Handler) => {
      if (!handlers.has(eventType)) handlers.set(eventType, new Set());
      handlers.get(eventType)!.add(handler);
      // Mirror the real contract: the unsubscribe fn removes this handler.
      return () => {
        mockUnsubscribe();
        handlers.get(eventType)?.delete(handler);
      };
    }),
    isConnected: mockIsConnected,
    clearPersistedCursor: mockClearPersistedCursor,
  }),
}));

import { useReorgReconciliation } from '@/hooks/useReorgReconciliation';
import type { TrackedTransaction } from '@/lib/reorg-reconciliation';

const VALID_HASH_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const VALID_HASH_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;

function emit(eventType: WebSocketEventType, payload: unknown) {
  const set = handlers.get(eventType);
  if (!set) return;
  for (const handler of Array.from(set)) handler(payload);
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { Wrapper, queryClient, invalidateSpy };
}

const trackedTx: TrackedTransaction = {
  hash: VALID_HASH_A,
  chainId: 10,
  status: 'confirmed',
};

describe('useReorgReconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    handlers.clear();
    mockIsConnected = true;
  });

  afterEach(() => {
    handlers.clear();
  });

  it('renders a hidden banner before any canonical event (no fabricated state)', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useReorgReconciliation({ trackedTx }), {
      wrapper: Wrapper,
    });
    expect(result.current.banner.state).toBe('hidden');
    expect(result.current.error).toBeNull();
  });

  it('marks the tracked tx reorged and invalidates projections on ROLLBACK', () => {
    const { Wrapper, invalidateSpy } = makeWrapper();
    const onReorgReconciled = jest.fn();

    const { result } = renderHook(
      () => useReorgReconciliation({ trackedTx, onReorgReconciled }),
      { wrapper: Wrapper },
    );

    act(() => {
      emit('ROLLBACK', {
        lastValidCursor: 'cursor-1',
        blockNumber: 100,
        affectedClaimIds: ['claim-1'],
      });
    });

    expect(result.current.banner.state).toBe('reorg-detected');
    expect(result.current.banner.orphanedHash).toBe(VALID_HASH_A);
    expect(result.current.banner.assertive).toBe(true);
    expect(mockClearPersistedCursor).toHaveBeenCalled();
    expect(onReorgReconciled).toHaveBeenCalledWith(
      expect.objectContaining({ lastValidCursor: 'cursor-1', blockNumber: 100 }),
    );

    const invalidatedRoots = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: string[] }).queryKey[0],
    );
    for (const root of ['claims', 'verifications', 'disputes', 'leaderboard', 'user']) {
      expect(invalidatedRoots).toContain(root);
    }
  });

  it('does not clear the cursor on REPLACEMENT (carries its own newCursor)', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useReorgReconciliation({ trackedTx }), {
      wrapper: Wrapper,
    });

    act(() => {
      emit('ROLLBACK', { lastValidCursor: 'cursor-1', blockNumber: 100 });
    });
    act(() => {
      emit('REPLACEMENT', {
        claimId: 'claim-1',
        newData: { txHash: VALID_HASH_B },
        previousCursor: 'cursor-1',
        newCursor: 'cursor-2',
        blockNumber: 101,
      });
    });

    expect(mockClearPersistedCursor).toHaveBeenCalledTimes(1);
    expect(result.current.banner.state).toBe('replacement-found');
    expect(result.current.banner.orphanedHash).toBe(VALID_HASH_A);
    expect(result.current.banner.replacementHash).toBe(VALID_HASH_B);
  });

  it('fails closed on malformed ROLLBACK payloads (stale-marking, no state change)', () => {
    const { Wrapper, invalidateSpy } = makeWrapper();
    const onReorgReconciled = jest.fn();

    const { result } = renderHook(
      () => useReorgReconciliation({ trackedTx, onReorgReconciled }),
      { wrapper: Wrapper },
    );

    act(() => {
      emit('ROLLBACK', { blockNumber: 'not-a-number' });
    });

    expect(result.current.banner.state).toBe('unresolved');
    expect(result.current.error).toMatch(/rejected/i);
    expect(onReorgReconciled).not.toHaveBeenCalled();
    expect(mockClearPersistedCursor).not.toHaveBeenCalled();

    const invalidatedRoots = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: string[] }).queryKey[0],
    );
    expect(invalidatedRoots).toContain('claims');
    expect(invalidatedRoots).toContain('verifications');
  });

  it('fails closed on malformed REPLACEMENT payloads', () => {
    const { Wrapper } = makeWrapper();
    const onReplacementApplied = jest.fn();

    const { result } = renderHook(
      () => useReorgReconciliation({ trackedTx, onReplacementApplied }),
      { wrapper: Wrapper },
    );

    act(() => {
      emit('REPLACEMENT', { previousCursor: 'same', newCursor: 'same', newData: {} });
    });

    expect(result.current.banner.state).toBe('unresolved');
    expect(result.current.error).toMatch(/rejected/i);
    expect(onReplacementApplied).not.toHaveBeenCalled();
  });

  it('surfaces a reorg banner even without a tracked transaction (uncertainty is visible)', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useReorgReconciliation(), { wrapper: Wrapper });

    act(() => {
      emit('ROLLBACK', { lastValidCursor: 'cursor-1', blockNumber: 100 });
    });

    expect(result.current.banner.state).toBe('reorg-detected');
    expect(result.current.banner.orphanedHash).toBeNull();
    expect(result.current.banner.assertive).toBe(true);
  });

  it('acknowledge() hides the banner', () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useReorgReconciliation({ trackedTx }), {
      wrapper: Wrapper,
    });

    act(() => {
      emit('ROLLBACK', { lastValidCursor: 'c', blockNumber: 5 });
    });
    expect(result.current.banner.state).toBe('reorg-detected');

    act(() => {
      result.current.acknowledge();
    });
    expect(result.current.banner.state).toBe('hidden');
  });

  it('does not subscribe when the socket is disconnected', () => {
    mockIsConnected = false;
    const { Wrapper } = makeWrapper();
    renderHook(() => useReorgReconciliation({ trackedTx }), { wrapper: Wrapper });

    act(() => {
      emit('ROLLBACK', { lastValidCursor: 'c', blockNumber: 5 });
    });
    // No handlers were registered, so nothing was processed.
    expect(mockClearPersistedCursor).not.toHaveBeenCalled();
  });

  it('removes subscriptions on unmount (no listener leaks)', () => {
    const { Wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useReorgReconciliation({ trackedTx }), {
      wrapper: Wrapper,
    });

    expect(handlers.get('ROLLBACK')?.size).toBe(1);
    expect(handlers.get('REPLACEMENT')?.size).toBe(1);

    unmount();

    expect(handlers.get('ROLLBACK')?.size ?? 0).toBe(0);
    expect(handlers.get('REPLACEMENT')?.size ?? 0).toBe(0);
  });

  it('resets transient state when a new tracked transaction is provided', () => {
    const { Wrapper } = makeWrapper();
    const { result, rerender } = renderHook(
      ({ tx }: { tx: TrackedTransaction | null }) => useReorgReconciliation({ trackedTx: tx }),
      { wrapper: Wrapper, initialProps: { tx: trackedTx as TrackedTransaction | null } },
    );

    act(() => {
      emit('ROLLBACK', { lastValidCursor: 'c', blockNumber: 5 });
    });
    expect(result.current.banner.state).toBe('reorg-detected');

    const nextTx: TrackedTransaction = {
      hash: VALID_HASH_B,
      chainId: 10,
      status: 'submitted',
    };
    rerender({ tx: nextTx });

    expect(result.current.banner.state).toBe('hidden');
  });
});
