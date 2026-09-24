"use client";

/**
 * V2-FE-091 — Canonical Wallet Provider Boundary
 * useCanonicalWallet — Single source of truth for wallet state at the UI boundary.
 *
 * This hook centralizes wallet connectivity, network validation, configuration
 * integrity, and connector errors into a deterministic, discriminated-union
 * state model. Downstream components should render based on `status` rather
 * than inspecting wallet internals.
 *
 * Invariants:
 *  - Address/chain values are never fabricated; they come directly from Wagmi.
 *  - On unsupported networks protocol-mutating actions are disabled.
 *  - Configuration errors surface as a first-class `config_error` boundary state.
 *  - Optimism/EVM only: no alternate-chain runtime code is introduced here.
 */

import { useMemo, useCallback } from "react";
import { useWallet } from "./useWallet";
import { useWalletNetwork } from "./useWalletNetwork";
import { useSwitchChain, useDisconnect, useChainId, useAccount } from "./web3";
import { validateWalletProviderConfig } from "@/lib/wallet-boundary/config-guard";
import { getAddressValidationError } from "@/lib/contracts/address-guard";
import type {
  WalletBoundaryState,
  CanonicalWallet,
} from "@/lib/wallet-boundary/types";

/**
 * Derive the canonical boundary state from underlying wallet/network/config state.
 * Pure function — kept separate from the hook so it can be unit-tested directly.
 */
export function deriveWalletBoundaryState(
  wallet: ReturnType<typeof useWallet>,
  network: ReturnType<typeof useWalletNetwork>,
  configErrors: readonly string[],
  addressValidationError: string | null,
): WalletBoundaryState {
  if (configErrors.length > 0) {
    return {
      status: "config_error",
      isLoading: false,
      isSupportedNetwork: false,
      isReady: false,
      isProtocolDisabled: true,
      address: undefined,
      chainId: undefined,
      connectorError: null,
      configError: new Error(configErrors.join("; ")),
    };
  }

  if (wallet.isPending) {
    return {
      status: "loading",
      isLoading: true,
      isSupportedNetwork: false,
      isReady: false,
      isProtocolDisabled: true,
      address: undefined,
      chainId: undefined,
      connectorError: null,
      configError: null,
    };
  }

  if (wallet.connectorError) {
    return {
      status: "account_error",
      isLoading: false,
      isSupportedNetwork: network.isSupported,
      isReady: false,
      isProtocolDisabled: true,
      address: wallet.address,
      chainId: wallet.chainId,
      connectorError: wallet.connectorError,
      configError: null,
    };
  }

  if (!wallet.isConnected || !wallet.address) {
    return {
      status: "disconnected",
      isLoading: false,
      isSupportedNetwork: false,
      isReady: false,
      isProtocolDisabled: true,
      address: undefined,
      chainId: undefined,
      connectorError: null,
      configError: null,
    };
  }

  if (addressValidationError) {
    return {
      status: "account_error",
      isLoading: false,
      isSupportedNetwork: network.isSupported,
      isReady: false,
      isProtocolDisabled: true,
      address: wallet.address,
      chainId: wallet.chainId,
      connectorError: new Error(
        `Invalid wallet address: ${addressValidationError}`,
      ),
      configError: null,
    };
  }

  if (!network.isSupported || network.isUnsupported) {
    return {
      status: "unsupported",
      isLoading: false,
      isSupportedNetwork: false,
      isReady: false,
      isProtocolDisabled: true,
      address: wallet.address,
      chainId: wallet.chainId ?? network.currentChainId ?? 0,
      connectorError: null,
      configError: null,
    };
  }

  return {
    status: "ready",
    isLoading: false,
    isSupportedNetwork: true,
    isReady: true,
    isProtocolDisabled: false,
    address: wallet.address,
    chainId: wallet.chainId ?? network.currentChainId ?? 0,
    connectorError: null,
    configError: null,
  };
}

/**
 * Returns the canonical wallet boundary state for the current session.
 */
export function useCanonicalWallet(): CanonicalWallet {
  const wallet = useWallet();
  const { switchChain } = useSwitchChain();
  const { disconnectAsync } = useDisconnect();
  const chainId = useChainId();
  const account = useAccount();

  const network = useWalletNetwork({
    chainId: wallet.chainId ?? chainId,
    isConnected: wallet.isConnected,
    switchChain,
  });

  const configValidation = useMemo(
    () => validateWalletProviderConfig(),
    // Re-validate when the connector set changes; this is a coarse but safe trigger.
    [wallet.activeConnector?.id],
  );

  const addressValidationError = useMemo(
    () => (wallet.address ? getAddressValidationError(wallet.address) : null),
    [wallet.address],
  );

  const state = useMemo(
    () =>
      deriveWalletBoundaryState(
        wallet,
        network,
        configValidation.errors,
        addressValidationError,
      ),
    [wallet, network, configValidation.errors, addressValidationError],
  );

  const switchToSupportedNetwork = useCallback(async () => {
    if (typeof switchChain !== "function") {
      throw new Error("Wallet connector does not support switching chains.");
    }
    const target = network.preferredChainId;
    const result = await switchChain({ chainId: target });
    network.clearChainScopedCaches();
    return result;
  }, [switchChain, network]);

  const addSupportedNetwork = useCallback(async () => {
    if (typeof wallet.activeConnector?.getProvider !== "function") {
      throw new Error("Wallet connector does not support adding chains.");
    }
    const provider = (await wallet.activeConnector.getProvider()) as {
      request?: (args: {
        method: string;
        params: unknown[];
      }) => Promise<unknown>;
    };
    if (!provider || typeof provider.request !== "function") {
      throw new Error(
        "Wallet provider unavailable for wallet_addEthereumChain.",
      );
    }

    const targetId = network.supportedChainIds.includes(11155420)
      ? 11155420
      : network.preferredChainId;
    const params = {
      chainId: `0x${targetId.toString(16)}`,
      chainName: targetId === 11155420 ? "OP Sepolia" : "OP Mainnet",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls:
        targetId === 11155420
          ? ["https://sepolia.optimism.io"]
          : ["https://mainnet.optimism.io"],
      blockExplorerUrls:
        targetId === 11155420
          ? ["https://sepolia-optimism.etherscan.io"]
          : ["https://optimistic.etherscan.io"],
    };

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [params],
    });
    network.clearChainScopedCaches();
    return params;
  }, [wallet.activeConnector, network]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectAsync();
    } catch (cause) {
      // Surface the disconnect failure but still clear the local preference.
      wallet.disconnect();
      throw cause;
    }
    wallet.disconnect();
  }, [disconnectAsync, wallet]);

  return {
    ...state,
    connect: wallet.connect,
    reconnect: wallet.reconnect,
    disconnect,
    clearError: wallet.clearError,
    switchToSupportedNetwork,
    addSupportedNetwork,
  };
}
