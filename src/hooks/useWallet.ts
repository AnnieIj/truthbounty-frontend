'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useConnectors,
  type Connector,
} from 'wagmi';
import { useIsMounted } from '@/hooks/useIsMounted';
import {
  WALLET_CONNECTOR_PREF_KEY,
  isValidWalletAccount,
  isSupportedWalletChain,
  isTrustedProviderConnection,
  planWalletReconnect,
  resolveProviderStatus,
  type WalletProviderSnapshot,
} from '@/lib/wallet/reconnect';

const PREF_KEY = WALLET_CONNECTOR_PREF_KEY;

function readConnectorPref(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}

function writeConnectorPref(connectorId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREF_KEY, connectorId);
  } catch {
    // Storage can be unavailable in privacy-restricted environments.
  }
}

function clearConnectorPref(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PREF_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted environments.
  }
}

export type WalletLifecycleState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unsupported-chain'
  | 'error';

export interface WalletLifecycle {
  /** True only when the active provider confirms a usable connection. */
  isConnected: boolean;
  isPending: boolean;
  address: `0x${string}` | undefined;
  chainId: number | undefined;
  /** True when the provider is on a chain the protocol does not accept. */
  unsupportedChain: boolean;
  /** True when the current chain is one the protocol accepts. */
  isSupportedChain: boolean;
  connectorError: Error | null;
  activeConnector: Connector | undefined;
  connectors: readonly Connector[];
  state: WalletLifecycleState;
  connect: (connector: Connector) => void;
  reconnect: () => void;
  disconnect: () => void;
  clearError: () => void;
}

export function useWallet(): WalletLifecycle {
  const mounted = useIsMounted();
  const {
    address,
    isConnected: wagmiConnected,
    isConnecting,
    isReconnecting,
    chainId,
    connector: activeConnector,
  } = useAccount();
  const { connect: wagmiConnect, isPending: connectPending } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const connectors = useConnectors();
  const [connectorError, setConnectorError] = useState<Error | null>(null);
  const previousAddress = useRef<`0x${string}` | undefined>(undefined);

  const provider = useMemo<WalletProviderSnapshot>(
    () => ({
      status: mounted
        ? resolveProviderStatus({
            isConnected: wagmiConnected,
            isConnecting,
            isReconnecting,
          })
        : 'unknown',
      address: address ?? null,
      chainId: chainId ?? null,
      connectorId: activeConnector?.id ?? null,
    }),
    [mounted, wagmiConnected, isConnecting, isReconnecting, address, chainId, activeConnector?.id],
  );

  // Provider state is authoritative: expose an identity only when the active
  // provider confirms a supported chain and a canonical account.
  const trustedConnection = mounted && isTrustedProviderConnection(provider);
  const accountConfirmed = mounted && provider.status === 'connected' && isValidWalletAccount(address);
  const chainSupported = mounted && isSupportedWalletChain(chainId);
  const isConnected = trustedConnection;
  const unsupportedChain = accountConfirmed && !chainSupported;

  useEffect(() => {
    if (!mounted) return;
    if (
      previousAddress.current !== undefined &&
      address !== undefined &&
      previousAddress.current !== address
    ) {
      setConnectorError(null);
    }
    previousAddress.current = address;
  }, [address, mounted]);

  // Persist the connector hint only for a provider-confirmed, usable session.
  useEffect(() => {
    if (mounted && trustedConnection && activeConnector?.id) {
      writeConnectorPref(activeConnector.id);
    }
  }, [trustedConnection, activeConnector?.id, mounted]);

  // Drop a stale cached hint (missing connector / untrusted provider account) so
  // it can never resurface as a phantom connection.
  useEffect(() => {
    if (!mounted) return;
    const plan = planWalletReconnect({
      provider,
      connectors,
      preferredConnectorId: readConnectorPref(),
    });
    if (plan.action === 'idle' && plan.clearPreference) {
      clearConnectorPref();
    }
  }, [mounted, provider, connectors]);

  const connectWith = useCallback(
    (connector: Connector) => {
      setConnectorError(null);
      wagmiConnect(
        { connector },
        {
          onError(error) {
            setConnectorError(
              error instanceof Error ? error : new Error(String(error)),
            );
          },
        },
      );
    },
    [wagmiConnect],
  );

  // Deterministic reconnection: the active provider wins; the persisted
  // preference is only ever a hint and is dropped when it goes stale.
  const reconnect = useCallback(() => {
    const plan = planWalletReconnect({
      provider,
      connectors,
      preferredConnectorId: readConnectorPref(),
    });

    if (plan.action === 'connect') {
      const connector = connectors.find(({ id }) => id === plan.connectorId);
      if (connector) connectWith(connector);
      return;
    }

    if (plan.clearPreference) {
      clearConnectorPref();
    }
  }, [provider, connectors, connectWith]);

  const disconnect = useCallback(() => {
    clearConnectorPref();
    setConnectorError(null);
    wagmiDisconnect();
  }, [wagmiDisconnect]);

  const clearError = useCallback(() => setConnectorError(null), []);

  const state = useMemo((): WalletLifecycleState => {
    if (!mounted) return 'disconnected';
    if (connectorError) return 'error';
    if (isConnecting || connectPending) return 'connecting';
    if (isReconnecting) return 'reconnecting';
    if (isConnected) return 'connected';
    if (unsupportedChain) return 'unsupported-chain';
    return 'disconnected';
  }, [
    mounted,
    connectorError,
    isConnecting,
    connectPending,
    isReconnecting,
    isConnected,
    unsupportedChain,
  ]);

  return {
    isConnected,
    isPending: isConnecting || connectPending || isReconnecting,
    address: isConnected ? address : undefined,
    chainId: isConnected ? chainId : undefined,
    unsupportedChain,
    isSupportedChain: chainSupported && accountConfirmed,
    connectorError,
    activeConnector: isConnected ? activeConnector : undefined,
    connectors,
    state,
    connect: connectWith,
    reconnect,
    disconnect,
    clearError,
  };
}
