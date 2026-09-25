/**
 * Integration test — Wallet connection lifecycle at the Wagmi/Viem boundary.
 *
 * Tests the full connect → account-change → disconnect flow using the wagmi
 * mock connector (no real browser wallet required).
 *
 * Covers acceptance criteria:
 *  ✓ connect, reconnect, disconnect, account-change, connector-error states
 *  ✓ hydration-safe: no phantom connected state before mount
 *  ✓ connector preference persisted (connector id only — no address/key)
 *  ✓ no synthetic transaction or protocol state produced
 *  ✓ wrong-network path surfaces isWrongNetwork=true via useWalletNetwork
 */

jest.unmock('wagmi');

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useConnect, useDisconnect } from 'wagmi';
import { http } from 'viem';
import { mainnet, optimism, optimismSepolia } from 'viem/chains';
import { createConfig, mock } from 'wagmi';
import { useWallet } from '@/hooks/useWallet';
import { useAccount } from '@/hooks/useAccount';
import { useWalletNetwork } from '@/hooks/useWalletNetwork';

// ── Fixture addresses ─────────────────────────────────────────────────────────
const ADDR_A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
const ADDR_B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

// ── Wagmi test config ─────────────────────────────────────────────────────────
const testConfig = createConfig({
  chains: [optimismSepolia, optimism],
  transports: {
    [optimismSepolia.id]: http(),
    [optimism.id]: http(),
  },
  connectors: [mock({ accounts: [ADDR_A, ADDR_B] })],
});

// A provider whose default chain is NOT supported by the protocol.
const unsupportedConfig = createConfig({
  chains: [mainnet, optimismSepolia],
  transports: {
    [mainnet.id]: http(),
    [optimismSepolia.id]: http(),
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

function UnsupportedWrapper({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={unsupportedConfig} reconnectOnMount={false}>
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
    await disconnect(unsupportedConfig);
  } catch {}
});

afterEach(async () => {
  try {
    const { disconnect } = require('@wagmi/core');
    await disconnect(testConfig);
    await disconnect(unsupportedConfig);
  } catch {}
});

// ── Helper ────────────────────────────────────────────────────────────────────
function getMockConnector() {
  return testConfig.connectors[0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Wallet lifecycle — connect / disconnect', () => {
  it('starts disconnected with no address or chain id', () => {
    const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeUndefined();
    expect(result.current.chainId).toBeUndefined();
    expect(result.current.state).toBe('disconnected');
  });

  it('reaches connected state and exposes the wallet address', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

    act(() => result.current.connect(getMockConnector()));

    await waitFor(() => expect(result.current.isConnected).toBe(true));

    expect(result.current.address).toMatch(/^0x/);
    expect(result.current.state).toBe('connected');
    expect(result.current.connectorError).toBeNull();
  });

  it('returns to disconnected and clears address after disconnect()', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

    act(() => result.current.connect(getMockConnector()));
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => result.current.disconnect());
    await waitFor(() => expect(result.current.isConnected).toBe(false));

    expect(result.current.address).toBeUndefined();
    expect(result.current.chainId).toBeUndefined();
  });
});

describe('Wallet lifecycle — connector error', () => {
  it('records connector error on rejection without crashing', async () => {
    const connector = getMockConnector();
    jest
      .spyOn(connector, 'connect')
      .mockRejectedValueOnce(new Error('User rejected the request.'));

    const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

    act(() => result.current.connect(connector));

    await waitFor(() => expect(result.current.state).toBe('error'));

    expect(result.current.connectorError?.message).toMatch(/rejected/i);
    expect(result.current.isConnected).toBe(false);

    jest.restoreAllMocks();
  });
});

describe('Wallet lifecycle — account change', () => {
  it('updates address when the active account changes', async () => {
    const connector = getMockConnector();
    const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

    act(() => result.current.connect(connector));
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    const originalAddress = result.current.address;

    await act(async () => {
      connector.onAccountsChanged?.([ADDR_B]);
    });

    await waitFor(() => {
      expect(result.current.address?.toLowerCase()).not.toBe(originalAddress?.toLowerCase());
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectorError).toBeNull();
  });
});

describe('Wallet lifecycle — reconnect preference', () => {
  it('reconnect() picks the saved connector and connects', async () => {
    localStorage.setItem('truthbounty:wallet:connector', getMockConnector().id);

    const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

    act(() => result.current.reconnect());

    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(result.current.address).toMatch(/^0x/);
  });

  it('disconnect() removes the saved preference', async () => {
    const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

    act(() => result.current.connect(getMockConnector()));
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(localStorage.getItem('truthbounty:wallet:connector')).not.toBeNull();

    act(() => result.current.disconnect());
    await waitFor(() => expect(result.current.isConnected).toBe(false));
    expect(localStorage.getItem('truthbounty:wallet:connector')).toBeNull();
  });
});

describe('Wallet lifecycle — hydration safety', () => {
  it('useAccount returns null on the first synchronous render', () => {
    const { result } = renderHook(() => useAccount(), { wrapper: Wrapper });
    // Before useIsMounted effect fires, result must be null.
    expect(result.current).toBeNull();
  });

  it('useWallet.isConnected is false on the first synchronous render', () => {
    const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });
    expect(result.current.isConnected).toBe(false);
  });
});

describe('Wallet lifecycle — wrong network', () => {
  it('isWrongNetwork is true when wallet is on an unsupported chain', () => {
    // Simulate a wallet connected to Ethereum mainnet (chainId 1)
    const { result } = renderHook(
      () =>
        useWalletNetwork({
          chainId: 1,
          isConnected: true,
          switchChain: jest.fn(),
        }),
      { wrapper: Wrapper },
    );

    expect(result.current.isWrongNetwork).toBe(true);
    expect(result.current.isProtocolDisabled).toBe(true);
    expect(result.current.action).toBe('switch');
  });

  it('isWrongNetwork is false when connected to OP Sepolia', () => {
    const { result } = renderHook(
      () =>
        useWalletNetwork({
          chainId: 11155420,
          isConnected: true,
          switchChain: jest.fn(),
        }),
      { wrapper: Wrapper },
    );

    expect(result.current.isWrongNetwork).toBe(false);
    expect(result.current.isProtocolDisabled).toBe(false);
  });
});

describe('Wallet lifecycle — no synthetic state', () => {
  it('useWallet never produces a fabricated address or balance', () => {
    const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });
    // Disconnected — nothing fabricated
    expect(result.current.address).toBeUndefined();
    expect(result.current.chainId).toBeUndefined();
  });

  it('useAccount never produces a fabricated address', () => {
    const { result } = renderHook(() => useAccount(), { wrapper: Wrapper });
    expect(result.current).toBeNull();
  });
});

describe('Wallet lifecycle — deterministic reconnection (V2-FE-045)', () => {
  it('drops a stale connector preference and stays disconnected', async () => {
    localStorage.setItem('truthbounty:wallet:connector', 'connector-that-no-longer-exists');

    const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

    await waitFor(() =>
      expect(localStorage.getItem('truthbounty:wallet:connector')).toBeNull(),
    );
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeUndefined();
  });

  it('does not reconnect from a preference while the provider is connected', async () => {
    const connector = getMockConnector();
    const { result } = renderHook(() => useWallet(), { wrapper: Wrapper });

    act(() => result.current.connect(connector));
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    // A corrupt/foreign preference must not override the active provider.
    localStorage.setItem('truthbounty:wallet:connector', 'some-other-connector');
    act(() => result.current.reconnect());

    expect(result.current.isConnected).toBe(true);
    expect(result.current.activeConnector?.id).toBe(connector.id);
  });

  it('fails closed when the provider confirms a connection on an unsupported chain', async () => {
    const connector = unsupportedConfig.connectors[0];
    const { result } = renderHook(() => useWallet(), { wrapper: UnsupportedWrapper });

    act(() => result.current.connect(connector));

    await waitFor(() => expect(result.current.state).toBe('unsupported-chain'));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.unsupportedChain).toBe(true);
    expect(result.current.address).toBeUndefined();
  });
});
