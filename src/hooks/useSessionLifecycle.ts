'use client';

/**
 * V2-FE-048 — useSessionLifecycle
 *
 * Rotates sessions safely (single-flight), reacts to the canonical server
 * `expiresAt`, detects reuse/revocation, synchronizes across tabs, and returns
 * users to a non-destructive signed-out state.
 *
 * The server session is authoritative. Timers only decide *when* to
 * re-evaluate/rotate; they never invent expiry or success.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createBrowserSessionStore,
  isSessionActive,
  type SessionStore,
} from '@/lib/auth/session-store';
import {
  buildRotationMessage,
  buildSignedOutMessage,
  classifySessionRefreshError,
  evaluateSessionHealth,
  isTerminalRefreshFailure,
  type SessionHealth,
  type SessionRefreshFailure,
  type SessionRefreshFailureKind,
  type SessionSignedOutReason,
} from '@/lib/auth/session-lifecycle';
import type { SessionSyncChannel } from '@/lib/auth/session-sync';
import type { SiweSession } from '@/lib/auth/siwe-types';

export interface UseSessionLifecycleOptions {
  sessionStore?: SessionStore;
  /** Rotate the session server-side. Receives the current session. */
  refreshSession?: ((current: SiweSession) => Promise<SiweSession>) | null;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Refresh once within this window of expiry. */
  refreshWindowMs?: number;
  /** Automatically rotate when a refresh becomes due. Default: true. */
  autoRefresh?: boolean;
  /** Cross-tab sync channel (create with createSessionSyncChannel). */
  syncChannel?: SessionSyncChannel | null;
  /** Notified whenever the effective session changes. */
  onSessionChange?: (session: SiweSession | null) => void;
}

export interface UseSessionLifecycleReturn {
  session: SiweSession | null;
  health: SessionHealth;
  isRefreshing: boolean;
  error: SessionRefreshFailure | null;
  /** True after a terminal failure/expiry until the user signs in again. */
  requiresReauth: boolean;
  signedOutReason: SessionSignedOutReason | null;
  /** Attempt a rotation. Resolves true when the session was rotated. */
  refresh: () => Promise<boolean>;
  /** Clear the session locally and notify other tabs. */
  signOut: (reason?: SessionSignedOutReason) => void;
  /** Dismiss the re-auth requirement after the user acknowledges it. */
  acknowledgeReauth: () => void;
  clearError: () => void;
}

function reasonForFailure(kind: SessionRefreshFailureKind): SessionSignedOutReason {
  if (kind === 'REUSED') return 'reused';
  if (kind === 'REVOKED' || kind === 'UNAUTHORIZED') return 'revoked';
  return 'expired';
}

function failureForSignedOut(reason: SessionSignedOutReason): SessionRefreshFailure | null {
  switch (reason) {
    case 'reused':
      return { kind: 'REUSED', message: 'This session was replaced in another tab.' };
    case 'revoked':
      return { kind: 'REVOKED', message: 'This session was revoked.' };
    case 'expired':
      return { kind: 'EXPIRED', message: 'This session expired.' };
    default:
      return null;
  }
}

export function useSessionLifecycle(
  options: UseSessionLifecycleOptions = {},
): UseSessionLifecycleReturn {
  const { sessionStore, refreshWindowMs = 60_000, autoRefresh = true, syncChannel } = options;

  const store = useMemo(
    () => sessionStore ?? createBrowserSessionStore(),
    [sessionStore],
  );

  const nowRef = useRef(options.now ?? (() => Date.now()));
  const refreshSessionRef = useRef(options.refreshSession ?? null);
  const onSessionChangeRef = useRef(options.onSessionChange);
  useEffect(() => {
    nowRef.current = options.now ?? (() => Date.now());
    refreshSessionRef.current = options.refreshSession ?? null;
    onSessionChangeRef.current = options.onSessionChange;
  }, [options.now, options.refreshSession, options.onSessionChange]);

  const [session, setSession] = useState<SiweSession | null>(null);
  const [clock, setClock] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<SessionRefreshFailure | null>(null);
  const [requiresReauth, setRequiresReauth] = useState(false);
  const [signedOutReason, setSignedOutReason] =
    useState<SessionSignedOutReason | null>(null);

  const sessionRef = useRef<SiweSession | null>(null);
  const refreshingRef = useRef(false);

  const updateSession = useCallback(
    (next: SiweSession | null) => {
      sessionRef.current = next;
      setSession(next);
      onSessionChangeRef.current?.(next);
    },
    [],
  );

  const adoptSession = useCallback(
    (next: SiweSession) => {
      store.set(next);
      updateSession(next);
    },
    [store, updateSession],
  );

  const terminate = useCallback(
    (reason: SessionSignedOutReason, failure: SessionRefreshFailure | null) => {
      store.clear();
      updateSession(null);
      setRequiresReauth(reason !== 'manual');
      setSignedOutReason(reason);
      if (failure) setError(failure);
      syncChannel?.publish(buildSignedOutMessage(reason));
    },
    [store, updateSession, syncChannel],
  );

  // Hydrate from the approved boundary on mount.
  useEffect(() => {
    const current = store.get();
    sessionRef.current = current;
    setSession(current);
  }, [store]);

  const health = useMemo(
    () => evaluateSessionHealth(session, nowRef.current(), refreshWindowMs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, clock, refreshWindowMs],
  );

  const refresh = useCallback(async (): Promise<boolean> => {
    const current = sessionRef.current ?? store.get();
    if (!current) return false;
    if (refreshingRef.current) return false;

    const rotate = refreshSessionRef.current;
    if (typeof rotate !== 'function') {
      // No rotation capability — fail closed once the session is no longer active.
      if (!isSessionActive(current, nowRef.current())) {
        terminate('expired', null);
      }
      return false;
    }

    refreshingRef.current = true;
    setIsRefreshing(true);
    setError(null);
    try {
      const next = await rotate(current);
      if (!next || !isSessionActive(next, nowRef.current())) {
        terminate('expired', null);
        return false;
      }
      adoptSession(next);
      setRequiresReauth(false);
      setSignedOutReason(null);
      syncChannel?.publish(buildRotationMessage(next));
      return true;
    } catch (err) {
      const failure = classifySessionRefreshError(err);
      setError(failure);
      if (isTerminalRefreshFailure(failure.kind)) {
        terminate(reasonForFailure(failure.kind), failure);
      }
      return false;
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [store, adoptSession, terminate, syncChannel]);

  // Re-evaluate at the refresh-due and expiry boundaries.
  useEffect(() => {
    if (!session) return;
    const nowMs = nowRef.current();
    const dueAt = session.expiresAt - Math.max(0, refreshWindowMs);
    const target = Math.max(nowMs + 1, Math.min(dueAt, session.expiresAt)) - nowMs;
    const id = setTimeout(() => setClock((value) => value + 1), Math.max(1, target + 1));
    return () => clearTimeout(id);
  }, [session, refreshWindowMs, clock]);

  // Auto-rotate once a refresh is due.
  useEffect(() => {
    if (!autoRefresh || health !== 'refresh-due') return;
    if (refreshingRef.current) return;
    if (typeof refreshSessionRef.current !== 'function') return;
    void refresh();
  }, [autoRefresh, health, refresh]);

  // Fail closed when the canonical expiry is reached (unless a rotation is in flight).
  useEffect(() => {
    if (!session || health !== 'expired') return;
    if (refreshingRef.current) return;
    terminate('expired', null);
  }, [session, health, terminate]);

  // Cross-tab synchronization.
  useEffect(() => {
    if (!syncChannel) return;
    return syncChannel.subscribe((message) => {
      if (message.type === 'rotated') {
        adoptSession(message.session);
        setRequiresReauth(false);
        setSignedOutReason(null);
      } else {
        store.clear();
        updateSession(null);
        setRequiresReauth(message.reason !== 'manual');
        setSignedOutReason(message.reason);
        setError(failureForSignedOut(message.reason));
      }
    });
  }, [syncChannel, store, adoptSession, updateSession]);

  const signOut = useCallback(
    (reason: SessionSignedOutReason = 'manual') => {
      terminate(reason, null);
    },
    [terminate],
  );

  const clearError = useCallback(() => setError(null), []);

  const acknowledgeReauth = useCallback(() => {
    setRequiresReauth(false);
    setSignedOutReason(null);
    setError(null);
  }, []);

  return {
    session,
    health,
    isRefreshing,
    error,
    requiresReauth,
    signedOutReason,
    refresh,
    signOut,
    acknowledgeReauth,
    clearError,
  };
}
