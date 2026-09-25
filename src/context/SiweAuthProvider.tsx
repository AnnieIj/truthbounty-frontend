'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAccount as useWagmiAccount } from 'wagmi';

import type { SiweSession } from '@/lib/auth/siwe-types';
import {
  createBrowserSessionStore,
  isSessionBoundToAccount,
  type SessionStore,
} from '@/lib/auth/session-store';
import { useIsMounted } from '@/hooks/useIsMounted';

interface SiweAuthContextValue {
  session: SiweSession | null;
  isAuthenticated: boolean;
  address: string | null;
  /** Register the current hook-level session state with the provider. */
  setSession: (session: SiweSession | null) => void;
}

const SiweAuthContext = createContext<SiweAuthContextValue>({
  session: null,
  isAuthenticated: false,
  address: null,
  setSession: () => {},
});

export function useSiweSession(): SiweAuthContextValue {
  return useContext(SiweAuthContext);
}

export interface SiweAuthProviderProps {
  children: ReactNode;
  sessionStore?: SessionStore;
}

/**
 * App-level SIWE session boundary. Wraps the tree (no visual impact) and
 * exposes the authenticated session so consumers can gate features without
 * re-deriving it. Persists via the approved client boundary.
 *
 * Determinism (V2-FE-045): a cached session only counts as authenticated when
 * the active wallet provider confirms its owner. Once the provider settles,
 * any unbound or stale session is cleared so it cannot resurface as a phantom
 * authenticated state.
 */
export function SiweAuthProvider({ children, sessionStore }: SiweAuthProviderProps) {
  const store = useMemo(() => sessionStore ?? createBrowserSessionStore(), [sessionStore]);
  const [session, setSessionState] = useState<SiweSession | null>(null);
  const mounted = useIsMounted();
  const { address, isConnected, isConnecting, isReconnecting } = useWagmiAccount();

  // The provider is settled once the tree has hydrated and no connection
  // (re)initialisation is in flight. Until then we must not judge a session.
  const providerSettled = mounted && !isConnecting && !isReconnecting;
  const confirmedAccount =
    providerSettled && isConnected && typeof address === 'string' ? address : null;

  // Hydrate from the approved boundary once on mount; drop inactive sessions.
  useEffect(() => {
    setSessionState(store.get());
  }, [store]);

  // Only keep a cached session while the active provider confirms its owner.
  useEffect(() => {
    if (!providerSettled || !session) return;
    if (!isSessionBoundToAccount(session, confirmedAccount)) {
      store.clear();
      setSessionState(null);
    }
  }, [providerSettled, session, confirmedAccount, store]);

  const setSession = useCallback(
    (next: SiweSession | null) => {
      if (next) {
        store.rotate(next);
      } else {
        store.clear();
      }
      setSessionState(next);
    },
    [store],
  );

  const isAuthenticated =
    providerSettled && isSessionBoundToAccount(session, confirmedAccount);

  const value = useMemo<SiweAuthContextValue>(
    () => ({ session, isAuthenticated, address: session?.address ?? null, setSession }),
    [session, isAuthenticated, setSession],
  );

  return <SiweAuthContext.Provider value={value}>{children}</SiweAuthContext.Provider>;
}
