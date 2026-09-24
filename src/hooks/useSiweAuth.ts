'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { recoverMessageAddress } from 'viem';
import { useAccount as useWagmiAccount } from 'wagmi';
import { useChainId as useWagmiChain } from 'wagmi';
import { useSignMessage } from 'wagmi';

import type {
  SiweChallenge,
  SiweFailure,
  SiweSession,
  SiweStatus,
} from '@/lib/auth/siwe-types';
import {
  createSiweApiClient,
  validateChallenge,
  type SiweApiClient,
} from '@/lib/auth/siwe-client';
import {
  createBrowserSessionStore,
  isSessionActive,
  type SessionStore,
} from '@/lib/auth/session-store';

const USER_REJECTION_MARKERS = ['user rejected', 'user denied', 'rejected the request', 'request rejected', 'action_rejected'];

function isUserRejection(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? '';
  const message = (err as { message?: string })?.message ?? '';
  return (
    /userrejected|user-rejected/i.test(name) ||
    USER_REJECTION_MARKERS.some((m) => message.toLowerCase().includes(m))
  );
}

function asFailure(err: unknown, fallback: SiweFailure): SiweFailure {
  const e = err as { kind?: string; message?: string; code?: string };
  if (e?.kind && ['NONCE_EXPIRED','USER_REJECTED','WRONG_ACCOUNT','WRONG_CHAIN','REPLAYED','INVALID_MESSAGE','NETWORK','UNAUTHORIZED'].includes(e.kind)) {
    return { kind: e.kind as SiweFailure['kind'], message: e.message ?? fallback.message, code: e.code };
  }
  if (isUserRejection(err)) {
    return { kind: 'USER_REJECTED', message: 'Signature request was rejected by the user.' };
  }
  return fallback;
}

export interface UseSiweAuthOptions {
  /** Base URL to the TruthBounty backend API. */
  apiUrl?: string;
  /** Replace the default API client (for tests). */
  apiClient?: SiweApiClient;
  /** Replace the default session store (for tests). */
  sessionStore?: SessionStore;
  /** Override the connected account/chain (for tests / non-wagmi hosts). */
  accountOverride?: { address?: string | null; chainId?: number | null };
  /** Inject a signature function for tests. Defaults to wagmi signMessage. */
  signMessage?: (message: string) => Promise<Uint8Array | `0x${string}`>;
  /** Override now() for deterministic freshness tests. */
  now?: () => number;
}

export interface UseSiweAuthReturn {
  status: SiweStatus;
  session: SiweSession | null;
  challenge: SiweChallenge | null;
  displayMessage: string | null;
  error: SiweFailure | null;
  isAuthenticated: boolean;
  isBusy: boolean;
  begin: () => Promise<void>;
  signAndSubmit: () => Promise<void>;
  clear: () => Promise<void>;
  resetError: () => void;
  /** The connected account address (from wagmi or override). */
  address: string | null;
  /** The connected chain id (from wagmi or override). */
  chainId: number | null;
}

/**
 * EIP-4361 SIWE authentication client hook.
 *
 * Orchestrates: request backend challenge → display exact message → sign with
 * the wallet → submit message+signature unchanged → store/rotate the session
 * through the approved client boundary. Handles nonce expiry, user rejection,
 * wrong account, wrong chain, and replay responses with typed failures.
 */
export function useSiweAuth(options: UseSiweAuthOptions = {}): UseSiweAuthReturn {
  const [status, setStatus] = useState<SiweStatus>('idle');
  const [challenge, setChallenge] = useState<SiweChallenge | null>(null);
  const [session, setSessionState] = useState<SiweSession | null>(null);
  const [error, setError] = useState<SiweFailure | null>(null);

  const apiClient = useMemo(
    () =>
      options.apiClient ??
      createSiweApiClient(
        options.apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? '/api',
      ),
    [options.apiClient, options.apiUrl],
  );
  const sessionStore = useMemo(
    () => options.sessionStore ?? createBrowserSessionStore(),
    [options.sessionStore],
  );

  // Hydrate an existing session on mount (idempotent / SSR-safe).
  useEffect(() => {
    const existing = sessionStore.get();
    if (existing) {
      setSessionState(existing);
      setStatus('authenticated');
    }
  }, [sessionStore]);

  const { address: wagmiAddress, isConnected } = useWagmiAccount();
  const wagmiChainId = useWagmiChain();

  const address = options.accountOverride?.address ?? (isConnected ? wagmiAddress : null) ?? null;
  const chainId = options.accountOverride?.chainId ?? wagmiChainId ?? null;

  const walletRef = useRef<{ address: string | null; chainId: number | null }>({ address, chainId });
  walletRef.current = { address, chainId };

  useEffect(() => {
    if (status !== 'ready-to-sign' || !challenge) return;
    const accountChanged =
      !address || challenge.address.toLowerCase() !== address.toLowerCase();
    const chainChanged = challenge.chainId !== chainId;
    if (!accountChanged && !chainChanged) return;

    setChallenge(null);
    setError({
      kind: accountChanged ? 'WRONG_ACCOUNT' : 'WRONG_CHAIN',
      message: 'Wallet changed. Request a new challenge and retry.',
    });
    setStatus('error');
  }, [address, chainId, challenge, status]);

  const signWithWagmi = useWagmiSignMessage();

  const doSign = options.signMessage ?? signWithWagmi;

  const isAuthenticated = Boolean(
    isSessionActive(session, options.now?.() ?? Date.now()) &&
    address !== null &&
    chainId !== null &&
    typeof session?.address === 'string' &&
    session.address.toLowerCase() === address.toLowerCase() &&
    session?.chainId === chainId
  );
  const isBusy =
    status === 'requesting-challenge' ||
    status === 'signing' ||
    status === 'submitting';

  const begin = useCallback(async () => {
    setError(null);
    if (!address) {
      setError({ kind: 'WRONG_ACCOUNT', message: 'Connect a wallet before starting sign-in.' });
      setStatus('error');
      return;
    }
    setStatus('requesting-challenge');
    setChallenge(null);
    try {
      const c = await apiClient.requestChallenge({ address, chainId: chainId ?? 0 });
      const outcome = validateChallenge(c, { address, chainId, now: options.now?.() ?? Date.now() });
      if (outcome.failure) {
        setError(outcome.failure);
        setStatus('error');
        return;
      }
      setChallenge(c);
      setStatus('ready-to-sign');
    } catch (err) {
      const failure = asFailure(err, {
        kind: 'NETWORK',
        message: 'Failed to request the SIWE challenge from the backend.',
      });
      setError(failure);
      setStatus('error');
    }
  }, [address, chainId, apiClient, options.now]);

  const signAndSubmit = useCallback(async () => {
    setError(null);
    if (!challenge) {
      setError({ kind: 'NETWORK', message: 'No challenge is available to sign.' });
      setStatus('error');
      return;
    }
    if (!address) {
      setError({ kind: 'WRONG_ACCOUNT', message: 'Wallet is disconnected. Reconnect and retry.' });
      setStatus('error');
      return;
    }

    // Defensive re-validation immediately before signing.
    const outcome = validateChallenge(challenge, { address, chainId, now: options.now?.() ?? Date.now() });
    if (outcome.failure) {
      setError(outcome.failure);
      setStatus('error');
      return;
    }

    setStatus('signing');
    let signature: `0x${string}`;
    try {
      const signed = await doSign(challenge.message);
      signature = normalizeSignature(signed);
    } catch (err) {
      const failure = asFailure(err, {
        kind: 'USER_REJECTED',
        message: 'Signature request failed or was rejected.',
      });
      setError(failure);
      setStatus('error');
      return;
    }

    // Client-side signature∩account sanity check (best effort; backend is
    // authoritative). Prevents proceeding on an obviously wrong signer.
    if (chainId !== null && chainId !== challenge.chainId) {
      setError({ kind: 'WRONG_CHAIN', message: 'Network changed during signing. Retry.' });
      setStatus('error');
      return;
    }
    try {
      const recovered = await recoverMessageAddress({ message: challenge.message, signature });
      if (recovered && recovered.toLowerCase() !== challenge.address.toLowerCase()) {
        setError({ kind: 'WRONG_ACCOUNT', message: 'Signature was produced by a different account.' });
        setStatus('error');
        return;
      }
    } catch {
      // Ignore recovery errors; the backend performs authoritative verification.
    }

    const currentWallet = walletRef.current;
    const accountChanged =
      !currentWallet.address ||
      currentWallet.address.toLowerCase() !== challenge.address.toLowerCase();
    if (accountChanged || currentWallet.chainId !== challenge.chainId) {
      setChallenge(null);
      setError({
        kind: accountChanged ? 'WRONG_ACCOUNT' : 'WRONG_CHAIN',
        message: 'Wallet changed during signing. Retry.',
      });
      setStatus('error');
      return;
    }
    
    setStatus('submitting');
    try {
      const res = await apiClient.submitVerification({
        message: challenge.message,
        signature,
        address: challenge.address,
        chainId: challenge.chainId,
      });
      const expiresMs = Date.parse(res.expiresAt);
      const nextSession: SiweSession = {
        address: res.address || challenge.address,
        chainId: res.chainId || challenge.chainId,
        token: res.token,
        expiresAt: Number.isNaN(expiresMs) ? Date.now() + 7 * 24 * 60 * 60 * 1000 : expiresMs,
        issuedAt: options.now?.() ?? Date.now(),
      };
      // Rotate (replace) any prior session material through the boundary.
      sessionStore.rotate(nextSession);
      setSessionState(nextSession);
      setStatus('authenticated');
    } catch (err) {
      const failure = asFailure(err, {
        kind: 'UNAUTHORIZED',
        message: 'Signature verification failed.',
      });
      // A replay or expired nonce invalidates the challenge; drop it.
      if (failure.kind === 'REPLAYED' || failure.kind === 'NONCE_EXPIRED') {
        setChallenge(null);
      }
      setError(failure);
      setStatus('error');
    }
  }, [address, chainId, challenge, doSign, apiClient, sessionStore, options.now]);

  const clear = useCallback(async () => {
    const current = sessionStore.get();
    if (current) {
      try {
        await apiClient.revokeSession({ token: current.token });
      } catch {
        // Best-effort revocation; local session is still cleared below.
      }
      sessionStore.clear();
    }
    setSessionState(null);
    setChallenge(null);
    setError(null);
    setStatus('idle');
  }, [apiClient, sessionStore]);

  const resetError = useCallback(() => setError(null), []);

  return {
    status,
    session,
    challenge,
    displayMessage: challenge?.message ?? null,
    error,
    isAuthenticated,
    isBusy,
    begin,
    signAndSubmit,
    clear,
    resetError,
    address: address ?? null,
    chainId,
  };
}

function normalizeSignature(sig: Uint8Array | `0x${string}`): `0x${string}` {
  if (typeof sig === 'string') return sig as `0x${string}`;
  let hex = '';
  for (const byte of sig) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return `0x${hex}` as `0x${string}`;
}

function useWagmiSignMessage(): (message: string) => Promise<Uint8Array | `0x${string}`> {
  const wagmiSign = useSignMessage() as unknown as {
    signMessageAsync?: (args: { message: string }) => Promise<`0x${string}`>;
    signMessage?: (args: { message: string }) => Promise<`0x${string}`> | void;
  };
  const signAsync = wagmiSign?.signMessageAsync;
  const sign = wagmiSign?.signMessage;

  return useCallback(
    async (message: string) => {
      if (typeof signAsync === 'function') {
        return signAsync({ message });
      }
      if (typeof sign === 'function') {
        const res = await sign({ message });
        if (typeof res === 'string') return res as `0x${string}`;
      }
      throw new Error('No signMessage method available on wallet.');
    },
    [signAsync, sign],
  );
}
