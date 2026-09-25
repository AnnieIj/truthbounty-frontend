/**
 * Unit tests for useWallet.
 *
 * Wagmi is mocked at the hook boundary so the suite tests TruthBounty wallet
 * lifecycle behavior without loading connector transports or browser wallets.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import type { Connector } from 'wagmi';
import { useWallet } from '../useWallet';

const mockConnector = {
  id: 'test-connector',
  name: 'Test connector',
  type: 'mock',
} as unknown as Connector;

let mockConnectors: Connector[] = [mockConnector];

let mockAccount = {
  address: undefined as `0x${string}` | undefined,
  isConnected: false,
  isConnecting: false,
  isReconnecting: false,
  chainId: undefined as number | undefined,
  connector: undefined as Connector | undefined,
};
let mockConnectPending = false;
let mockConnectError: Error | null = null;

const mockDisconnect = jest.fn(() => {
  mockAccount = {
    ...mockAccount,
    address: undefined,
    isConnected: false,
    connector: undefined,
  };
});

const mockConnect = jest.fn(
  (
    { connector }: { connector: Connector },
    callbacks?: { onError?: (error: Error) => void },
  ) => {
    if (mockConnectError) {
      callbacks?.onError?.(mockConnectError);
      return;
    }
    mockAccount = {
      ...mockAccount,
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      isConnected: true,
      chainId: 11155420,
      connector,
    };
  },
);

jest.mock('wagmi', () => ({
  useAccount: () => mockAccount,
  useConnect: () => ({ connect: mockConnect, isPending: mockConnectPending }),
  useDisconnect: () => ({ disconnect: mockDisconnect }),
  useConnectors: () => mockConnectors,
}));

beforeEach(() => {
  localStorage.clear();
  mockConnect.mockClear();
  mockDisconnect.mockClear();
  mockConnectError = null;
  mockConnectPending = false;
  mockConnectors = [mockConnector];
  mockAccount = {
    address: undefined,
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    chainId: undefined,
    connector: undefined,
  };
});

describe('useWallet', () => {
  it('starts disconnected without exposing stale account data', () => {
    const { result } = renderHook(() => useWallet());
    expect(result.current.state).toBe('disconnected');
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeUndefined();
    expect(result.current.chainId).toBeUndefined();
  });

  it('persists the active connector id for a connected account', async () => {
    mockAccount = {
      ...mockAccount,
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      isConnected: true,
      chainId: 11155420,
      connector: mockConnector,
    };
    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.state).toBe('connected'));
    expect(result.current.address).toMatch(/^0x/);
    expect(result.current.chainId).toBe(11155420);
    await waitFor(() =>
      expect(localStorage.getItem('truthbounty:wallet:connector')).toBe(mockConnector.id),
    );
  });

  it('reports connector rejection and clears the error explicitly', async () => {
    mockConnectError = new Error('User rejected the request.');
    const { result } = renderHook(() => useWallet());

    act(() => result.current.connect(mockConnector));
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.connectorError?.message).toMatch(/rejected/i);

    act(() => result.current.clearError());
    expect(result.current.connectorError).toBeNull();
    expect(result.current.state).toBe('disconnected');
  });

  it('disconnects and removes the stored connector preference', async () => {
    mockAccount = {
      ...mockAccount,
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      isConnected: true,
      chainId: 11155420,
      connector: mockConnector,
    };
    localStorage.setItem('truthbounty:wallet:connector', mockConnector.id);
    const { result, rerender } = renderHook(() => useWallet());

    act(() => result.current.disconnect());
    rerender();

    await waitFor(() => expect(result.current.state).toBe('disconnected'));
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('truthbounty:wallet:connector')).toBeNull();
  });

  it('reconnects only through the persisted connector', () => {
    localStorage.setItem('truthbounty:wallet:connector', mockConnector.id);
    const { result } = renderHook(() => useWallet());

    act(() => result.current.reconnect());
    expect(mockConnect).toHaveBeenCalledWith(
      { connector: mockConnector },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('does not reconnect when no preference is stored', () => {
    const { result } = renderHook(() => useWallet());
    act(() => result.current.reconnect());
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('exposes pending and reconnecting lifecycle states', () => {
    mockConnectPending = true;
    const pending = renderHook(() => useWallet());
    expect(pending.result.current.state).toBe('connecting');
    pending.unmount();

    mockConnectPending = false;
    mockAccount = { ...mockAccount, isReconnecting: true };
    const reconnecting = renderHook(() => useWallet());
    expect(reconnecting.result.current.state).toBe('reconnecting');
  });
});

describe('useWallet — deterministic reconnection (V2-FE-045)', () => {
  const connectedAccount = {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`,
    isConnected: true,
    isConnecting: false,
    isReconnecting: false,
    chainId: 11155420,
    connector: mockConnector,
  };

  it('does not expose a trusted connection while the provider is on an unsupported chain', async () => {
    mockAccount = { ...connectedAccount, chainId: 1 };
    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.state).toBe('unsupported-chain'));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.unsupportedChain).toBe(true);
    expect(result.current.address).toBeUndefined();
    expect(result.current.chainId).toBeUndefined();
  });

  it('fails closed when the provider reports a malformed account', async () => {
    mockAccount = {
      ...connectedAccount,
      address: '0xnot-an-address' as `0x${string}`,
    };
    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.isConnected).toBe(false));
    expect(result.current.address).toBeUndefined();
  });

  it('does not reconnect when the provider already confirms a connection', async () => {
    mockAccount = connectedAccount;
    const { result } = renderHook(() => useWallet());

    await waitFor(() => expect(result.current.isConnected).toBe(true));
    act(() => result.current.reconnect());

    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('does not race an in-flight provider connection', async () => {
    mockAccount = { ...mockAccount, isReconnecting: true };
    localStorage.setItem('truthbounty:wallet:connector', mockConnector.id);
    const { result } = renderHook(() => useWallet());

    act(() => result.current.reconnect());

    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('clears a stale connector preference instead of connecting', () => {
    localStorage.setItem('truthbounty:wallet:connector', 'removed-connector');
    const { result } = renderHook(() => useWallet());

    // Re-seed in case the mount cleanup already dropped it, then reconnect.
    localStorage.setItem('truthbounty:wallet:connector', 'removed-connector');
    act(() => result.current.reconnect());

    expect(mockConnect).not.toHaveBeenCalled();
    expect(localStorage.getItem('truthbounty:wallet:connector')).toBeNull();
  });

  it('drops the cached preference when the provider account is untrusted', async () => {
    localStorage.setItem('truthbounty:wallet:connector', mockConnector.id);
    mockAccount = {
      ...connectedAccount,
      address: '0xdead' as `0x${string}`,
    };
    renderHook(() => useWallet());

    await waitFor(() =>
      expect(localStorage.getItem('truthbounty:wallet:connector')).toBeNull(),
    );
  });
});
