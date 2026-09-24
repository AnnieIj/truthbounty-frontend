/**
 * V2-FE-091 — Unit tests for the canonical wallet provider boundary hook.
 */

import { renderHook } from '@testing-library/react';
import { deriveWalletBoundaryState } from '../useCanonicalWallet';
import type { WalletLifecycle } from '../useWallet';
import type { UseWalletNetworkReturn } from '../useWalletNetwork';

const mockWalletLifecycle = (
  overrides: Partial<WalletLifecycle> = {},
): WalletLifecycle =>
  ({
    isConnected: false,
    isPending: false,
    address: undefined,
    chainId: undefined,
    connectorError: null,
    activeConnector: undefined,
    connectors: [],
    state: 'disconnected',
    connect: jest.fn(),
    reconnect: jest.fn(),
    disconnect: jest.fn(),
    clearError: jest.fn(),
    ...overrides,
  }) as WalletLifecycle;

const mockNetwork = (
  overrides: Partial<UseWalletNetworkReturn> = {},
): UseWalletNetworkReturn =>
  ({
    isSupported: false,
    isUnsupported: false,
    currentChainId: undefined,
    preferredChainId: 10,
    supportedChainIds: [10, 11155420],
    clearChainScopedCaches: jest.fn(),
    switchToSupportedNetwork: jest.fn(),
    addSupportedNetwork: jest.fn(),
    ...overrides,
  }) as UseWalletNetworkReturn;

describe('deriveWalletBoundaryState', () => {
  it('returns loading when the wallet is pending', () => {
    const state = deriveWalletBoundaryState(
      mockWalletLifecycle({ isPending: true }),
      mockNetwork(),
      [],
      null,
    );
    expect(state.status).toBe('loading');
    expect(state.isLoading).toBe(true);
    expect(state.isProtocolDisabled).toBe(true);
  });

  it('returns config_error when configuration errors are provided', () => {
    const state = deriveWalletBoundaryState(
      mockWalletLifecycle(),
      mockNetwork(),
      ['NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required'],
      null,
    );
    expect(state.status).toBe('config_error');
    expect(state.isProtocolDisabled).toBe(true);
    expect(state.configError).toBeInstanceOf(Error);
  });

  it('returns disconnected when no wallet is connected', () => {
    const state = deriveWalletBoundaryState(
      mockWalletLifecycle(),
      mockNetwork(),
      [],
      null,
    );
    expect(state.status).toBe('disconnected');
    expect(state.isReady).toBe(false);
    expect(state.address).toBeUndefined();
  });

  it('returns unsupported when wallet is connected to an unsupported chain', () => {
    const state = deriveWalletBoundaryState(
      mockWalletLifecycle({
        isConnected: true,
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E',
        chainId: 1,
      }),
      mockNetwork({ isUnsupported: true, currentChainId: 1 }),
      [],
      null,
    );
    expect(state.status).toBe('unsupported');
    expect(state.isProtocolDisabled).toBe(true);
    expect(state.chainId).toBe(1);
  });

  it('returns account_error when the wallet address is invalid', () => {
    const state = deriveWalletBoundaryState(
      mockWalletLifecycle({
        isConnected: true,
        address: '0x0000000000000000000000000000000000000000',
        chainId: 10,
      }),
      mockNetwork({ isSupported: true, currentChainId: 10 }),
      [],
      'Zero address (0x000...000) is prohibited as an operational contract or account address',
    );
    expect(state.status).toBe('account_error');
    expect(state.connectorError).toBeInstanceOf(Error);
    expect(state.connectorError?.message).toMatch(/Zero address/);
  });

  it('returns account_error when the connector reports an error', () => {
    const state = deriveWalletBoundaryState(
      mockWalletLifecycle({
        isConnected: false,
        connectorError: new Error('User rejected the request.'),
      }),
      mockNetwork(),
      [],
      null,
    );
    expect(state.status).toBe('account_error');
    expect(state.connectorError).toBeInstanceOf(Error);
  });

  it('returns ready when wallet is connected to a supported chain with a valid address', () => {
    const state = deriveWalletBoundaryState(
      mockWalletLifecycle({
        isConnected: true,
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E',
        chainId: 10,
      }),
      mockNetwork({ isSupported: true, currentChainId: 10 }),
      [],
      null,
    );
    expect(state.status).toBe('ready');
    expect(state.isReady).toBe(true);
    expect(state.isProtocolDisabled).toBe(false);
    expect(state.address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E');
    expect(state.chainId).toBe(10);
  });

  it('never fabricates an address or chain', () => {
    const state = deriveWalletBoundaryState(
      mockWalletLifecycle(),
      mockNetwork(),
      [],
      null,
    );
    expect(state.status).not.toBe('ready');
    expect('address' in state ? state.address : undefined).toBeUndefined();
    expect('chainId' in state ? state.chainId : undefined).toBeUndefined();
  });
});
