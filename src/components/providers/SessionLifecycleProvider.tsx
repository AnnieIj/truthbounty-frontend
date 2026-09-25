'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';

import {
  createBrowserSessionStore,
  type SessionStore,
} from '@/lib/auth/session-store';
import {
  createSessionSyncChannel,
  type SessionSyncChannel,
} from '@/lib/auth/session-sync';
import { createSiweApiClient, type SiweApiClient } from '@/lib/auth/siwe-client';
import type { SiweSession } from '@/lib/auth/siwe-types';
import {
  useSessionLifecycle,
  type UseSessionLifecycleReturn,
} from '@/hooks/useSessionLifecycle';
import { SessionLifecycleBanner } from '@/components/auth/SessionLifecycleBanner';

export interface SessionLifecycleProviderProps {
  children: ReactNode;
  sessionStore?: SessionStore;
  apiClient?: SiweApiClient;
  syncChannel?: SessionSyncChannel;
  /** Explicit rotation function (otherwise the API client's refresh is used). */
  refreshSession?: (current: SiweSession) => Promise<SiweSession>;
}

const SessionLifecycleContext = createContext<UseSessionLifecycleReturn | null>(null);

/** Access the app-level session lifecycle state (or null outside the provider). */
export function useSessionLifecycleContext(): UseSessionLifecycleReturn | null {
  return useContext(SessionLifecycleContext);
}

/**
 * Adapt the backend SIWE client's rotation endpoint into a SessionStore
 * rotation. Fails closed when the host does not support refresh.
 */
function adaptRefresh(
  api: SiweApiClient,
): (current: SiweSession) => Promise<SiweSession> {
  return async (current) => {
    if (typeof api.refreshSession !== 'function') {
      throw Object.assign(
        new Error('Session refresh is not supported by this host.'),
        { kind: 'INVALID' },
      );
    }
    const res = await api.refreshSession({ token: current.token });
    const expires = Date.parse(res.expiresAt);
    return {
      address: res.address || current.address,
      chainId:
        typeof res.chainId === 'number' && res.chainId > 0
          ? res.chainId
          : current.chainId,
      token: res.token,
      expiresAt: Number.isNaN(expires) ? current.expiresAt : expires,
      issuedAt: Date.now(),
    };
  };
}

/**
 * V2-FE-048 — App-level session lifecycle boundary.
 *
 * Rotates sessions safely, detects reuse/revocation, synchronizes tabs, and
 * renders non-destructive, accessible recovery feedback.
 */
export function SessionLifecycleProvider({
  children,
  sessionStore,
  apiClient,
  syncChannel,
  refreshSession,
}: SessionLifecycleProviderProps) {
  const store = useMemo(
    () => sessionStore ?? createBrowserSessionStore(),
    [sessionStore],
  );
  const api = useMemo(
    () =>
      apiClient ??
      createSiweApiClient(process.env.NEXT_PUBLIC_API_URL ?? '/api'),
    [apiClient],
  );
  const channel = useMemo(
    () => syncChannel ?? createSessionSyncChannel(),
    [syncChannel],
  );
  useEffect(() => () => channel.close(), [channel]);

  const lifecycle = useSessionLifecycle({
    sessionStore: store,
    refreshSession: refreshSession ?? adaptRefresh(api),
    syncChannel: channel,
  });

  return (
    <SessionLifecycleContext.Provider value={lifecycle}>
      <SessionLifecycleBanner
        health={lifecycle.health}
        isRefreshing={lifecycle.isRefreshing}
        error={lifecycle.error}
        requiresReauth={lifecycle.requiresReauth}
        onRefresh={() => {
          void lifecycle.refresh();
        }}
        onSignInAgain={lifecycle.acknowledgeReauth}
      />
      {children}
    </SessionLifecycleContext.Provider>
  );
}

export default SessionLifecycleProvider;
