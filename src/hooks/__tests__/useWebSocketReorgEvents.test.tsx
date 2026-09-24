/**
 * V2-FE-144 — useWebSocket reorg event delivery tests.
 *
 * Before this work, `ROLLBACK`/`REPLACEMENT` messages were consumed by the
 * config callbacks and never reached typed subscribers (`subscribe()`), which
 * made projection-aware reconciliation impossible. These tests pin the dual
 * delivery contract.
 *
 * Coverage:
 *  - ROLLBACK → onRollback callback + typed subscriber, both once
 *  - REPLACEMENT → onReplacement callback + typed subscriber, both once
 *  - lastMessage reflects reorg events
 *  - duplicate events are deduplicated (processed once)
 *  - other event types keep single delivery (no double-dispatch)
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { WebSocketEvent } from '@/app/types/websocket';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
  send() {}
  close() {
    this.onclose?.({ wasClean: true });
  }
  static emit(event: Partial<WebSocketEvent> & { type: string }) {
    const data = JSON.stringify({ timestamp: new Date().toISOString(), ...event });
    for (const instance of MockWebSocket.instances) {
      instance.onmessage?.({ data });
    }
  }
  static reset() {
    MockWebSocket.instances = [];
  }
}

const originalWebSocket = global.WebSocket;

beforeEach(() => {
  MockWebSocket.reset();
  localStorage.clear();
  global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
  global.WebSocket = originalWebSocket;
  MockWebSocket.reset();
});

function renderSocket(overrides: Record<string, unknown> = {}) {
  const onRollback = jest.fn();
  const onReplacement = jest.fn();
  const onMessage = jest.fn();

  const wrapper = ({ children }: { children: React.ReactNode }) => children;
  const { result, unmount } = renderHook(() => useWebSocket({ url: 'ws://test:1234/ws', onRollback, onReplacement, onMessage, ...overrides }), { wrapper });

  const typedHandlers: Record<string, jest.Mock[]> = {};
  function collectSubscriptions() {
    const unsubscribeRollback = result.current.subscribe('ROLLBACK', jest.fn((payload) => {
      (typedHandlers['ROLLBACK'] ??= []).push(payload as never);
    }) as never);
    const unsubscribeReplacement = result.current.subscribe('REPLACEMENT', jest.fn((payload) => {
      (typedHandlers['REPLACEMENT'] ??= []).push(payload as never);
    }) as never);
    return [unsubscribeRollback, unsubscribeReplacement];
  }

  return { result, unmount, onRollback, onReplacement, onMessage, typedHandlers, collectSubscriptions };
}

describe('useWebSocket — reorg event delivery', () => {
  it('delivers ROLLBACK to both the callback and typed subscribers', async () => {
    const socket = renderSocket();
    await waitFor(() => expect(socket.result.current.isConnected).toBe(true));

    const unsubscribes = socket.collectSubscriptions();
    const payload = { lastValidCursor: 'cursor-1', blockNumber: 100 };

    act(() => {
      MockWebSocket.emit({ type: 'ROLLBACK', payload });
    });

    expect(socket.onRollback).toHaveBeenCalledTimes(1);
    expect(socket.onRollback).toHaveBeenCalledWith(payload);
    expect(socket.typedHandlers['ROLLBACK']).toEqual([payload]);
    expect(socket.result.current.lastMessage?.type).toBe('ROLLBACK');

    unsubscribes.forEach((u) => u());
  });

  it('delivers REPLACEMENT to both the callback and typed subscribers', async () => {
    const socket = renderSocket();
    await waitFor(() => expect(socket.result.current.isConnected).toBe(true));

    const unsubscribes = socket.collectSubscriptions();
    const payload = {
      claimId: 'claim-1',
      newData: { txHash: '0x' + 'b'.repeat(64) },
      previousCursor: 'a',
      newCursor: 'b',
      blockNumber: 101,
    };

    act(() => {
      MockWebSocket.emit({ type: 'REPLACEMENT', payload });
    });

    expect(socket.onReplacement).toHaveBeenCalledTimes(1);
    expect(socket.onReplacement).toHaveBeenCalledWith(payload);
    expect(socket.typedHandlers['REPLACEMENT']).toEqual([payload]);

    unsubscribes.forEach((u) => u());
  });

  it('does not double-dispatch regular events (single delivery)', async () => {
    const socket = renderSocket();
    await waitFor(() => expect(socket.result.current.isConnected).toBe(true));

    const unsubscribes = socket.collectSubscriptions();
    const payload = { claim: { id: 'c1' } };

    act(() => {
      MockWebSocket.emit({ type: 'CLAIM_CREATED', payload });
    });

    expect(socket.onMessage).toHaveBeenCalledTimes(1);
    expect(socket.typedHandlers['ROLLBACK']).toBeUndefined();

    unsubscribes.forEach((u) => u());
  });

  it('deduplicates identical reorg events', async () => {
    const socket = renderSocket();
    await waitFor(() => expect(socket.result.current.isConnected).toBe(true));

    const unsubscribes = socket.collectSubscriptions();
    const payload = { lastValidCursor: 'cursor-1', blockNumber: 100 };
    const emitSame = () =>
      MockWebSocket.emit({
        type: 'ROLLBACK',
        payload,
        cursor: 'cursor-1',
        timestamp: '2026-09-24T00:00:00.000Z',
      });

    act(() => {
      emitSame();
      emitSame();
    });

    expect(socket.onRollback).toHaveBeenCalledTimes(1);
    expect(socket.typedHandlers['ROLLBACK']).toHaveLength(1);

    unsubscribes.forEach((u) => u());
  });

  it('updates the cursor from a rollback event carrying one', async () => {
    const socket = renderSocket();
    await waitFor(() => expect(socket.result.current.isConnected).toBe(true));

    act(() => {
      MockWebSocket.emit({
        type: 'ROLLBACK',
        payload: { lastValidCursor: 'c1', blockNumber: 100 },
        cursor: 'cursor-9',
      });
    });

    await waitFor(() => {
      expect(socket.result.current.lastCursor).toBe('cursor-9');
    });
  });
});
