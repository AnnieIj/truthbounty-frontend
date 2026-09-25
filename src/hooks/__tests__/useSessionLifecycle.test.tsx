/**
 * V2-FE-048 — useSessionLifecycle unit tests.
 *
 * Safe rotation (single-flight), canonical expiry, terminal failure handling,
 * cross-tab sync, and non-destructive sign-out.
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import { useSessionLifecycle } from '../useSessionLifecycle';
import {
  buildRotationMessage,
  buildSignedOutMessage,
  type SessionSyncMessage,
} from '@/lib/auth/session-lifecycle';
import { createMemorySessionStore } from '@/lib/auth/session-store';
import type { SiweSession } from '@/lib/auth/siwe-types';

const NOW = Date.parse('2026-08-31T12:00:00.000Z');

let nowMs = NOW;
function setNow(value: number) {
  nowMs = value;
}

function makeSession(overrides: Partial<SiweSession> = {}): SiweSession {
  return {
    address: '0x742d35cc6634c0532925a3b844bc9e7595f0eb1e',
    chainId: 10,
    token: 'token-1',
    expiresAt: NOW + 3_600_000,
    issuedAt: NOW,
    ...overrides,
  };
}

function makeSyncChannel() {
  let handler: ((message: SessionSyncMessage) => void) | null = null;
  return {
    publish: jest.fn(),
    subscribe: jest.fn((h: (message: SessionSyncMessage) => void) => {
      handler = h;
      return () => {
        handler = null;
      };
    }),
    close: jest.fn(),
    emit: (message: SessionSyncMessage) => handler?.(message),
  };
}

beforeEach(() => {
  nowMs = NOW;
});

describe('useSessionLifecycle — hydration and rotation', () => {
  it('hydrates the session and reports active health', async () => {
    const store = createMemorySessionStore(() => nowMs);
    store.set(makeSession());

    const { result } = renderHook(() =>
      useSessionLifecycle({
        sessionStore: store,
        refreshSession: null,
        now: () => nowMs,
        syncChannel: null,
      }),
    );

    await waitFor(() => expect(result.current.session?.token).toBe('token-1'));
    expect(result.current.health).toBe('active');
  });

  it('rotates a refresh-due session once and publishes the rotation', async () => {
    const store = createMemorySessionStore(() => nowMs);
    store.set(makeSession({ expiresAt: NOW + 30_000 }));

    const refreshed = makeSession({ token: 'token-2', expiresAt: NOW + 3_600_000 });
    const refreshSession = jest.fn().mockResolvedValue(refreshed);
    const channel = makeSyncChannel();

    const { result } = renderHook(() =>
      useSessionLifecycle({
        sessionStore: store,
        refreshSession,
        now: () => nowMs,
        refreshWindowMs: 60_000,
        syncChannel: channel as never,
      }),
    );

    await waitFor(() => expect(result.current.session?.token).toBe('token-2'));
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalledWith(expect.objectContaining({ token: 'token-1' }));
    expect(store.get()?.token).toBe('token-2');
    expect(result.current.health).toBe('active');
    expect(channel.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'rotated' }),
    );
  });

  it('performs a single rotation for concurrent refresh calls', async () => {
    const store = createMemorySessionStore(() => nowMs);
    store.set(makeSession({ expiresAt: NOW + 30_000 }));

    let resolveRefresh: ((session: SiweSession) => void) | null = null;
    const refreshSession = jest.fn(
      () =>
        new Promise<SiweSession>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useSessionLifecycle({
        sessionStore: store,
        refreshSession,
        now: () => nowMs,
        autoRefresh: false,
        syncChannel: null,
      }),
    );

    await waitFor(() => expect(result.current.session).not.toBeNull());

    await act(async () => {
      const first = result.current.refresh();
      const second = result.current.refresh();
      resolveRefresh?.(makeSession({ token: 'token-2' }));
      await Promise.all([first, second]);
    });

    expect(refreshSession).toHaveBeenCalledTimes(1);
  });
});

describe('useSessionLifecycle — terminal failures and expiry', () => {
  it('fails closed and requires re-auth when the token was reused', async () => {
    const store = createMemorySessionStore(() => nowMs);
    store.set(makeSession({ expiresAt: NOW + 30_000 }));
    const refreshSession = jest.fn().mockRejectedValue({ kind: 'REPLAYED' });
    const channel = makeSyncChannel();

    const { result } = renderHook(() =>
      useSessionLifecycle({
        sessionStore: store,
        refreshSession,
        now: () => nowMs,
        syncChannel: channel as never,
      }),
    );

    await waitFor(() => expect(result.current.requiresReauth).toBe(true));
    expect(result.current.session).toBeNull();
    expect(store.get()).toBeNull();
    expect(result.current.signedOutReason).toBe('reused');
    expect(channel.publish).toHaveBeenCalledWith(buildSignedOutMessage('reused'));
  });

  it('keeps the session and stays retryable on a network error', async () => {
    const store = createMemorySessionStore(() => nowMs);
    store.set(makeSession({ expiresAt: NOW + 30_000 }));
    const refreshSession = jest.fn().mockRejectedValue({ kind: 'NETWORK' });

    const { result } = renderHook(() =>
      useSessionLifecycle({
        sessionStore: store,
        refreshSession,
        now: () => nowMs,
        syncChannel: null,
      }),
    );

    await waitFor(() => expect(result.current.error?.kind).toBe('NETWORK'));
    expect(result.current.session).not.toBeNull();
    expect(result.current.requiresReauth).toBe(false);
  });

  it('clears an expired session when no rotation capability exists', async () => {
    jest.useFakeTimers();
    try {
      const store = createMemorySessionStore(() => nowMs);
      store.set(makeSession({ expiresAt: NOW + 1_000 }));

      const { result } = renderHook(() =>
        useSessionLifecycle({
          sessionStore: store,
          refreshSession: null,
          now: () => nowMs,
          refreshWindowMs: 0,
          syncChannel: null,
        }),
      );

      expect(result.current.health).toBe('active');

      setNow(NOW + 5_000);
      await act(async () => {
        jest.advanceTimersByTime(1_001);
      });

      await waitFor(() => expect(result.current.requiresReauth).toBe(true));
      expect(result.current.signedOutReason).toBe('expired');
      expect(store.get()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useSessionLifecycle — cross-tab sync and sign-out', () => {
  it('adopts a session rotated in another tab', async () => {
    const store = createMemorySessionStore(() => nowMs);
    const channel = makeSyncChannel();

    const { result } = renderHook(() =>
      useSessionLifecycle({
        sessionStore: store,
        refreshSession: null,
        now: () => nowMs,
        syncChannel: channel as never,
      }),
    );

    await waitFor(() => expect(result.current.session).toBeNull());

    const rotated = makeSession({ token: 'token-from-tab-b' });
    act(() => {
      channel.emit(buildRotationMessage(rotated));
    });

    await waitFor(() => expect(result.current.session?.token).toBe('token-from-tab-b'));
    expect(store.get()?.token).toBe('token-from-tab-b');
  });

  it('signs out when another tab reports revocation', async () => {
    const store = createMemorySessionStore(() => nowMs);
    store.set(makeSession());
    const channel = makeSyncChannel();

    const { result } = renderHook(() =>
      useSessionLifecycle({
        sessionStore: store,
        refreshSession: null,
        now: () => nowMs,
        syncChannel: channel as never,
      }),
    );

    await waitFor(() => expect(result.current.session).not.toBeNull());

    act(() => {
      channel.emit(buildSignedOutMessage('revoked'));
    });

    await waitFor(() => expect(result.current.session).toBeNull());
    expect(result.current.requiresReauth).toBe(true);
    expect(store.get()).toBeNull();
  });

  it('signs out manually without requiring re-auth', async () => {
    const store = createMemorySessionStore(() => nowMs);
    store.set(makeSession());
    const channel = makeSyncChannel();

    const { result } = renderHook(() =>
      useSessionLifecycle({
        sessionStore: store,
        refreshSession: null,
        now: () => nowMs,
        syncChannel: channel as never,
      }),
    );

    await waitFor(() => expect(result.current.session).not.toBeNull());

    act(() => {
      result.current.signOut();
    });

    await waitFor(() => expect(result.current.session).toBeNull());
    expect(result.current.requiresReauth).toBe(false);
    expect(channel.publish).toHaveBeenCalledWith(buildSignedOutMessage('manual'));
  });

  it('acknowledgeReauth clears the recovery flag after confirmation', async () => {
    const store = createMemorySessionStore(() => nowMs);
    store.set(makeSession({ expiresAt: NOW + 30_000 }));
    const refreshSession = jest.fn().mockRejectedValue({ kind: 'REVOKED' });

    const { result } = renderHook(() =>
      useSessionLifecycle({
        sessionStore: store,
        refreshSession,
        now: () => nowMs,
        syncChannel: null,
      }),
    );

    await waitFor(() => expect(result.current.requiresReauth).toBe(true));
    act(() => result.current.acknowledgeReauth());
    await waitFor(() => expect(result.current.requiresReauth).toBe(false));
    expect(result.current.signedOutReason).toBeNull();
  });
});
