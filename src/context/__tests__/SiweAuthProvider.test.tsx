/**
 * V2-FE-045 — SiweAuthProvider determinism tests.
 *
 * A cached SIWE session must never appear authenticated unless the active
 * wallet provider confirms the session owner. Stale sessions are cleared once
 * the provider settles, and are left untouched while a reconnect is in flight.
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';

import { SiweAuthProvider, useSiweSession } from '../SiweAuthProvider';
import { createMemorySessionStore } from '@/lib/auth/session-store';
import type { SiweSession } from '@/lib/auth/siwe-types';

const NOW = Date.now();
const ADDRESS_A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ADDRESS_B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

let mockAccountState = {
  address: undefined as string | undefined,
  isConnected: false,
  isConnecting: false,
  isReconnecting: false,
};

jest.mock('wagmi', () => ({
  useAccount: () => mockAccountState,
}));

function makeSession(overrides: Partial<SiweSession> = {}): SiweSession {
  return {
    address: ADDRESS_A,
    chainId: 10,
    token: 'token-abc',
    expiresAt: NOW + 60_000,
    issuedAt: NOW,
    ...overrides,
  };
}

function renderProvider(seed?: SiweSession) {
  const store = createMemorySessionStore(() => NOW);
  if (seed) store.set(seed);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SiweAuthProvider sessionStore={store}>{children}</SiweAuthProvider>
  );
  const hook = renderHook(() => useSiweSession(), { wrapper });
  return { store, ...hook };
}

beforeEach(() => {
  mockAccountState = {
    address: undefined,
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
  };
});

describe('SiweAuthProvider — stale session handling (V2-FE-045)', () => {
  it('authenticates a cached session only when the provider confirms its owner', async () => {
    mockAccountState = {
      address: ADDRESS_A,
      isConnected: true,
      isConnecting: false,
      isReconnecting: false,
    };
    const { result } = renderProvider(makeSession());

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.address?.toLowerCase()).toBe(ADDRESS_A.toLowerCase());
  });

  it('clears a cached session whose owner differs from the provider account', async () => {
    mockAccountState = {
      address: ADDRESS_B,
      isConnected: true,
      isConnecting: false,
      isReconnecting: false,
    };
    const { result, store } = renderProvider(makeSession({ address: ADDRESS_A }));

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(result.current.session).toBeNull();
    expect(store.get()).toBeNull();
  });

  it('clears a cached session when the provider is disconnected', async () => {
    const { result, store } = renderProvider(makeSession());

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(store.get()).toBeNull();
  });

  it('does not clear the session while a provider reconnect is in flight', async () => {
    mockAccountState = {
      address: undefined,
      isConnected: false,
      isConnecting: false,
      isReconnecting: true,
    };
    const { result, store, rerender } = renderProvider(makeSession());

    // While reconnecting the provider is not settled: no judgement, no wipe.
    expect(result.current.isAuthenticated).toBe(false);
    expect(store.get()?.token).toBe('token-abc');

    // Provider settles on the matching account → session becomes valid again.
    mockAccountState = {
      address: ADDRESS_A,
      isConnected: true,
      isConnecting: false,
      isReconnecting: false,
    };
    rerender();

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(store.get()?.token).toBe('token-abc');
  });

  it('binds a newly registered session and authenticates it', async () => {
    mockAccountState = {
      address: ADDRESS_A,
      isConnected: true,
      isConnecting: false,
      isReconnecting: false,
    };
    const { result } = renderProvider();

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));

    act(() => {
      result.current.setSession(makeSession({ token: 'fresh' }));
    });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.session?.token).toBe('fresh');
  });
});
