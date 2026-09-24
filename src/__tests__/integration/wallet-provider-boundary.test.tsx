/**
 * V2-FE-091 — Integration test for the canonical wallet provider boundary.
 *
 * Verifies that the boundary surfaces deterministic states for:
 *   - disconnected
 *   - connected but unsupported network
 *   - connected and ready on OP Sepolia
 *
 * Uses the real wagmi mock connector so the test exercises the full hook stack
 * without requiring a browser wallet.
 */

jest.unmock('wagmi');

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { http } from 'viem';
import { optimism, optimismSepolia } from 'viem/chains';
import { createConfig, mock } from 'wagmi';
import { useCanonicalWallet } from '@/hooks/useCanonicalWallet';

const ADDR_A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

const testConfig = createConfig({
  chains: [optimismSepolia, optimism],
  transports: {
    [optimismSepolia.id]: http(),
    [optimism.id]: http(),
  },
  connectors: [mock({ accounts: [ADDR_A] })],
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={testConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

beforeEach(async () => {
  localStorage.clear();
  queryClient.clear();
  try {
    const { disconnect } = require('@wagmi/core');
    await disconnect(testConfig);
  } catch {}
});

afterEach(async () => {
  try {
    const { disconnect } = require('@wagmi/core');
    await disconnect(testConfig);
  } catch {}
});

describe('Wallet provider boundary integration', () => {
  it('starts in a non-ready state with no fabricated address', () => {
    const { result } = renderHook(() => useCanonicalWallet(), { wrapper: Wrapper });
    expect(result.current.isReady).toBe(false);
    expect(result.current.address).toBeUndefined();
    expect(result.current.isProtocolDisabled).toBe(true);
  });

  it('transitions to ready on OP Sepolia with a real connector address', async () => {
    const { result } = renderHook(() => useCanonicalWallet(), { wrapper: Wrapper });

    act(() => result.current.connect(testConfig.connectors[0]));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.address).toMatch(/^0x/);
    expect(result.current.chainId).toBe(optimismSepolia.id);
    expect(result.current.isSupportedNetwork).toBe(true);
    expect(result.current.isProtocolDisabled).toBe(false);
  });

  it('surfaces unsupported state when connected to an unsupported chain', async () => {
    const connector = testConfig.connectors[0];

    const { result } = renderHook(() => useCanonicalWallet(), { wrapper: Wrapper });

    act(() => result.current.connect(connector));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      connector.onChainChanged?.('0x1'); // Ethereum mainnet
    });

    await waitFor(() => {
      expect(result.current.status).toBe('unsupported');
    });

    expect(result.current.isSupportedNetwork).toBe(false);
    expect(result.current.isProtocolDisabled).toBe(true);
  });

  it('never exposes a fabricated transaction or protocol outcome', async () => {
    const { result } = renderHook(() => useCanonicalWallet(), { wrapper: Wrapper });

    expect(result.current).not.toHaveProperty('balance');
    expect(result.current).not.toHaveProperty('txHash');
    expect(result.current).not.toHaveProperty('rewards');
    expect(result.current).not.toHaveProperty('reputation');
  });
});
