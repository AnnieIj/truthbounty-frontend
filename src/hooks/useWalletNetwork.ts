import { useCallback, useMemo } from "react";

export const OPTIMISM_MAINNET_CHAIN_ID = 10;
export const OPTIMISM_SEPOLIA_CHAIN_ID = 11155420;

export type ApprovedOptimismChainId =
  typeof OPTIMISM_MAINNET_CHAIN_ID | typeof OPTIMISM_SEPOLIA_CHAIN_ID;

export type WalletNetworkAction = "none" | "switch" | "add" | "unsupported";

export interface WalletNetworkDefinition {
  chainId: number;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls?: string[];
  blockExplorers?: Array<{
    name: string;
    url: string;
  }>;
}

export const APPROVED_OPTIMISM_ENVIRONMENTS: Record<
  string,
  WalletNetworkDefinition
> = {
  optimism: {
    chainId: OPTIMISM_MAINNET_CHAIN_ID,
    name: "OP Mainnet",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: ["https://mainnet.optimism.io"],
    blockExplorers: [
      {
        name: "Etherscan",
        url: "https://optimistic.etherscan.io",
      },
    ],
  },
  "optimism-sepolia": {
    chainId: OPTIMISM_SEPOLIA_CHAIN_ID,
    name: "OP Sepolia",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: ["https://sepolia.optimism.io"],
    blockExplorers: [
      {
        name: "Etherscan",
        url: "https://sepolia-optimism.etherscan.io",
      },
    ],
  },
};

export const SUPPORTED_OPTIMISM_CHAIN_IDS = Object.values(
  APPROVED_OPTIMISM_ENVIRONMENTS,
).map((chain) => chain.chainId);

export type WalletNetworkSwitchRequest = {
  chainId: number;
};

export interface UseWalletNetworkOptions {
  chainId?: number;
  isConnected?: boolean;
  switchChain?:
    | ((request: WalletNetworkSwitchRequest) => Promise<unknown> | unknown)
    | null;
  addChain?:
    ((chain: WalletNetworkDefinition) => Promise<unknown> | unknown) | null;
  clearCache?: (() => void) | null;
  supportedChainIds?: readonly number[];
}

export function getPreferredOptimismChainId(
  chainIds: readonly number[] = SUPPORTED_OPTIMISM_CHAIN_IDS,
) {
  if (chainIds.length === 0) {
    return OPTIMISM_MAINNET_CHAIN_ID;
  }

  return chainIds.includes(OPTIMISM_MAINNET_CHAIN_ID)
    ? OPTIMISM_MAINNET_CHAIN_ID
    : chainIds[0];
}

export function getNetworkDefinition(
  chainId: number,
): WalletNetworkDefinition | undefined {
  return Object.values(APPROVED_OPTIMISM_ENVIRONMENTS).find(
    (chain) => chain.chainId === chainId,
  );
}

export interface UseWalletNetworkReturn {
  supportedChainIds: readonly number[];
  preferredChainId: number;
  currentChainId: number | undefined;
  isConnected: boolean;
  isSupported: boolean;
  isUnsupported: boolean;
  isWrongNetwork: boolean;
  isProtocolDisabled: boolean;
  action: WalletNetworkAction;
  clearChainScopedCaches: () => void;
  switchToSupportedNetwork: () => Promise<unknown>;
  addSupportedNetwork: () => Promise<unknown>;
}

export function useWalletNetwork(
  options: UseWalletNetworkOptions = {},
): UseWalletNetworkReturn {
  const {
    supportedChainIds: optionSupportedChainIds,
    chainId: optionChainId,
    isConnected: optionIsConnected,
    switchChain,
    addChain,
    clearCache,
  } = options;

  const supportedChainIds = useMemo(
    () => optionSupportedChainIds ?? SUPPORTED_OPTIMISM_CHAIN_IDS,
    [optionSupportedChainIds],
  );
  const preferredChainId = getPreferredOptimismChainId(supportedChainIds);
  const isConnected = optionIsConnected ?? false;
  const currentChainId =
    typeof optionChainId === "number" ? optionChainId : undefined;
  const isSupported =
    typeof currentChainId === "number" &&
    supportedChainIds.includes(currentChainId);
  const isUnsupported =
    isConnected && typeof currentChainId === "number" && !isSupported;
  const isWrongNetwork = isUnsupported;
  const isProtocolDisabled = !isConnected || isUnsupported;
  const safeAction: WalletNetworkAction = isUnsupported
    ? switchChain
      ? "switch"
      : addChain
        ? "add"
        : "unsupported"
    : "none";

  const clearChainScopedCaches = useCallback(() => {
    if (typeof clearCache === "function") {
      clearCache();
      return;
    }

    const matchKeys = [
      "truthbounty-chain-cache",
      "truthbounty:chain",
      "truthbounty:wallet:network",
    ];
    if (typeof window === "undefined") {
      return;
    }

    for (const key of matchKeys) {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    }
  }, [clearCache]);

  const switchToSupportedNetwork = useCallback(async () => {
    if (!isConnected || !supportedChainIds.length) {
      return undefined;
    }

    if (typeof switchChain !== "function") {
      throw new Error("Wallet connector does not support switching chains.");
    }

    const targetChainId = preferredChainId;
    const result = await switchChain({ chainId: targetChainId });
    clearChainScopedCaches();
    return result;
  }, [
    clearChainScopedCaches,
    isConnected,
    switchChain,
    preferredChainId,
    supportedChainIds.length,
  ]);

  const addSupportedNetwork = useCallback(async () => {
    if (!isConnected || !supportedChainIds.length) {
      return undefined;
    }

    if (typeof addChain !== "function") {
      throw new Error("Wallet connector does not support adding a chain.");
    }

    const targetChainId = supportedChainIds.includes(OPTIMISM_SEPOLIA_CHAIN_ID)
      ? OPTIMISM_SEPOLIA_CHAIN_ID
      : preferredChainId;
    const targetChain = getNetworkDefinition(targetChainId) ?? {
      chainId: targetChainId,
      name: "Optimism",
      nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
      },
    };

    const result = await addChain(targetChain);
    clearChainScopedCaches();
    return result;
  }, [
    clearChainScopedCaches,
    isConnected,
    addChain,
    preferredChainId,
    supportedChainIds,
  ]);

  return {
    supportedChainIds,
    preferredChainId,
    currentChainId,
    isConnected,
    isSupported,
    isUnsupported,
    isWrongNetwork,
    isProtocolDisabled,
    action: safeAction,
    clearChainScopedCaches,
    switchToSupportedNetwork,
    addSupportedNetwork,
  };
}
