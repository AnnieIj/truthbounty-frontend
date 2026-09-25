"use client";

import { useMemo } from "react";
import {
  useAccount as useWagmiAccount,
  useChainId as useWagmiChainId,
  useSwitchChain as useWagmiSwitchChain,
  useDisconnect as useWagmiDisconnect,
  usePublicClient as useWagmiPublicClient,
  useWalletClient as useWagmiWalletClient,
  type UseAccountReturnType,
} from "wagmi";
import {
  isSupportedChain,
  type SupportedChainId,
  supportedChains,
} from "@/config/wagmi";

/**
 * Format an EVM address to a truncated display string (e.g. 0x1234...5678)
 */
export function formatAddress(address?: string | null): string {
  if (!address) return "";
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export interface CanonicalAccountState {
  address: `0x${string}` | undefined;
  displayName: string;
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  isDisconnected: boolean;
  status: UseAccountReturnType["status"];
  chainId: number | undefined;
  chain: UseAccountReturnType["chain"];
  connector: UseAccountReturnType["connector"];
  isSupportedNetwork: boolean;
}

/**
 * Canonical typed account hook for TruthBounty V2 EVM runtime
 */
export function useCanonicalAccount(): CanonicalAccountState {
  const account = useWagmiAccount();

  return useMemo(() => {
    const isSupported = isSupportedChain(account.chainId);
    const displayName = formatAddress(account.address);

    return {
      address: account.address,
      displayName,
      isConnected: account.isConnected,
      isConnecting: account.isConnecting,
      isReconnecting: account.isReconnecting,
      isDisconnected: account.isDisconnected,
      status: account.status,
      chainId: account.chainId,
      chain: account.chain,
      connector: account.connector,
      isSupportedNetwork: isSupported,
    };
  }, [
    account.address,
    account.isConnected,
    account.isConnecting,
    account.isReconnecting,
    account.isDisconnected,
    account.status,
    account.chainId,
    account.chain,
    account.connector,
  ]);
}

/**
 * Hook to verify whether the connected wallet is on a supported Optimism chain
 */
export function useIsSupportedChain(): {
  isSupported: boolean;
  chainId: number | undefined;
  supportedChainIds: readonly SupportedChainId[];
} {
  const chainId = useWagmiChainId();
  return {
    isSupported: isSupportedChain(chainId),
    chainId,
    supportedChainIds: supportedChains.map((chain) => chain.id),
  };
}

export {
  useWagmiAccount as useAccount,
  useWagmiChainId as useChainId,
  useWagmiSwitchChain as useSwitchChain,
  useWagmiDisconnect as useDisconnect,
  useWagmiPublicClient as usePublicClient,
  useWagmiWalletClient as useWalletClient,
};
