/**
 * V2 Chain Configuration - Canonical EVM/Optimism
 *
 * Parameterizes confirmation/finality rules by canonical chain configuration.
 * Never hardcode blockchain parameters - always use chain config.
 * Contract addresses are bound to the versioned release manifest (V2-FE-043);
 * undeployed chains leave `truthBounty` unset — zero/placeholder addresses
 * are never accepted.
 */

import { isValidContractAddress } from '@/lib/contracts/address-guard';
import { getContractAddress, getReleaseChainId } from '@/lib/contracts/registry';

function releaseAddressForChain(chainId: number): `0x${string}` | undefined {
  try {
    if (getReleaseChainId() !== chainId) return undefined;
    const address = getContractAddress('TruthBountyWeighted');
    return isValidContractAddress(address) ? address : undefined;
  } catch {
    return undefined;
  }
}

export interface ChainFinality {
  /** Chain ID (EIP-155) */
  id: number;
  /** Chain name */
  name: string;
  /** Chain slug for URLs/APIs */
  slug: string;

  // Confirmation thresholds (blocks)
  /** Blocks to consider 'confirmed' (included in block) */
  confirmationBlocks: number;
  /** Blocks to consider 'safe' (reorg-resistant) */
  safeBlocks: number;
  /** Blocks to consider 'finalized' (canonical/immutable) */
  finalizedBlocks: number;

  // Timing (milliseconds)
  /** Expected block time */
  blockTimeMs: number;
  /** Expected time to confirmation */
  confirmationTimeMs: number;
  /** Expected time to safe state */
  safeTimeMs: number;
  /** Expected time to finality */
  finalityTimeMs: number;

  // Layer 2 specific (Optimism, Arbitrum, etc)
  isL2: boolean;
  /** Parent chain ID for L2s (1 for Ethereum mainnet) */
  parentChainId?: number;
  /** Sequencer fee factor (Optimism: ~1x, Base: ~1x) */
  sequencerFeeFactor: number;
  /** L2 -> L1 batching interval (ms) */
  batchIntervalMs?: number;
  /** L1 batch finality confirmation requirement */
  l1ConfirmationsRequired?: number;

  // RPC endpoints
  rpcUrl: string;
  rpcUrls?: string[]; // Fallback RPC endpoints

  // Block explorer
  blockExplorer: {
    name: string;
    url: string;
    txPath: string; // e.g., /tx/{hash}
  };

  // Indexer/Subgraph
  indexer?: {
    url: string;
    healthCheckUrl?: string;
    expectedLatencyMs?: number;
  };

  // Network validation
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };

  // Gas estimation
  gasEstimation: {
    defaultGasLimit: bigint;
    defaultGasPrice?: bigint; // Legacy EIP-1559 fallback
    eip1559: boolean; // Supports EIP-1559 (Optimism does)
    eip1559Factor: number; // Priority fee multiplier
  };

  // Stale transaction detection
  staleness: {
    maxAgeMs: number; // Max time to trust submitted state
    maxConfirmationTimeMs: number; // Max wait for confirmation
    maxRetries: number; // Max retry attempts
    retryDelayMs: number; // Initial retry delay (exponential backoff)
  };

  // Contract verification (TruthBounty canonical)
  contracts: {
    /**
     * Primary TruthBounty contract address from the reviewed release manifest.
     * Undefined when the chain has no reviewed deployment (never a placeholder).
     */
    truthBounty?: `0x${string}`;
    /** Token contract (if separate) */
    token?: `0x${string}`;
    /** Indexer contract hooks */
    indexer?: `0x${string}`;
  };

  // Feature flags per chain
  features: {
    supportsEIP1559: boolean;
    supportsEIP4844: boolean; // Blobs (Dencun)
    supportsAccessList: boolean;
    supportsSimulation: boolean; // eth_call simulation
  };

  // Validation rules
  validation: {
    minConfirmations: number; // Minimum for any operation
    minSafeConfirmations: number; // Minimum for "safe" operations
    minFinalConfirmations: number; // Minimum for "finalized" state
    addressVersion: 1; // EIP-55 checksum version
  };
}

/**
 * Optimism Mainnet Configuration
 * Reference: https://optimism.io/
 */
export const OPTIMISM_MAINNET: ChainFinality = {
  id: 10,
  name: 'Optimism',
  slug: 'optimism',

  confirmationBlocks: 1,
  safeBlocks: 2,
  finalizedBlocks: 4,

  blockTimeMs: 2000,
  confirmationTimeMs: 2000,
  safeTimeMs: 4000,
  finalityTimeMs: 12 * 60 * 1000, // ~12 minutes for L1 batch finality

  isL2: true,
  parentChainId: 1,
  sequencerFeeFactor: 1.0,
  batchIntervalMs: 60 * 1000, // ~60s batches
  l1ConfirmationsRequired: 64, // Optimism's standard L1 safety margin

  rpcUrl: 'https://mainnet.optimism.io',
  rpcUrls: [
    'https://mainnet.optimism.io',
    'https://opt-mainnet.g.alchemy.com/v2/demo',
  ],

  blockExplorer: {
    name: 'Etherscan (Optimism)',
    url: 'https://optimistic.etherscan.io',
    txPath: '/tx/{hash}',
  },

  indexer: {
    url: 'https://api.thegraph.com/subgraphs/name/truthbounty/optimism',
    healthCheckUrl: 'https://api.thegraph.com/index-node/graphql',
    expectedLatencyMs: 5000,
  },

  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },

  gasEstimation: {
    defaultGasLimit: BigInt(21000),
    eip1559: true,
    eip1559Factor: 2,
  },

  staleness: {
    maxAgeMs: 30 * 60 * 1000, // 30 minutes
    maxConfirmationTimeMs: 5 * 60 * 1000, // 5 minutes
    maxRetries: 5,
    retryDelayMs: 1000,
  },

  contracts: {
    // No reviewed mainnet deployment in the pinned release; leave unset.
  },

  features: {
    supportsEIP1559: true,
    supportsEIP4844: true,
    supportsAccessList: true,
    supportsSimulation: true,
  },

  validation: {
    minConfirmations: 1,
    minSafeConfirmations: 2,
    minFinalConfirmations: 4,
    addressVersion: 1,
  },
};

/**
 * Optimism Sepolia (Testnet) Configuration
 */
export const OPTIMISM_SEPOLIA: ChainFinality = {
  ...OPTIMISM_MAINNET,
  id: 11155420,
  name: 'Optimism Sepolia',
  slug: 'optimism-sepolia',
  rpcUrl: 'https://sepolia.optimism.io',
  rpcUrls: ['https://sepolia.optimism.io'],
  blockExplorer: {
    name: 'Etherscan (Optimism Sepolia)',
    url: 'https://sepolia-optimistic.etherscan.io',
    txPath: '/tx/{hash}',
  },
  contracts: {
    ...(releaseAddressForChain(11155420)
      ? { truthBounty: releaseAddressForChain(11155420) as `0x${string}` }
      : {}),
  },
};

/**
 * Base Mainnet Configuration (Optimism Stack)
 */
export const BASE_MAINNET: ChainFinality = {
  id: 8453,
  name: 'Base',
  slug: 'base',

  confirmationBlocks: 1,
  safeBlocks: 2,
  finalizedBlocks: 4,

  blockTimeMs: 2000,
  confirmationTimeMs: 2000,
  safeTimeMs: 4000,
  finalityTimeMs: 12 * 60 * 1000,

  isL2: true,
  parentChainId: 1,
  sequencerFeeFactor: 1.0,
  batchIntervalMs: 60 * 1000,
  l1ConfirmationsRequired: 64,

  rpcUrl: 'https://mainnet.base.org',
  blockExplorer: {
    name: 'Etherscan (Base)',
    url: 'https://basescan.org',
    txPath: '/tx/{hash}',
  },

  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },

  gasEstimation: {
    defaultGasLimit: BigInt(21000),
    eip1559: true,
    eip1559Factor: 2,
  },

  staleness: {
    maxAgeMs: 30 * 60 * 1000,
    maxConfirmationTimeMs: 5 * 60 * 1000,
    maxRetries: 5,
    retryDelayMs: 1000,
  },

  contracts: {
    // No reviewed Base deployment in the pinned release; leave unset.
  },

  features: {
    supportsEIP1559: true,
    supportsEIP4844: true,
    supportsAccessList: true,
    supportsSimulation: true,
  },

  validation: {
    minConfirmations: 1,
    minSafeConfirmations: 2,
    minFinalConfirmations: 4,
    addressVersion: 1,
  },
};

/**
 * Ethereum Mainnet Configuration
 * For reference and alternative deployment
 */
export const ETHEREUM_MAINNET: ChainFinality = {
  id: 1,
  name: 'Ethereum',
  slug: 'ethereum',

  confirmationBlocks: 1,
  safeBlocks: 5,
  finalizedBlocks: 32,

  blockTimeMs: 12000,
  confirmationTimeMs: 12000,
  safeTimeMs: 60000,
  finalityTimeMs: 12 * 60 * 1000,

  isL2: false,
  sequencerFeeFactor: 0,

  rpcUrl: 'https://eth.public.antml.com',
  blockExplorer: {
    name: 'Etherscan',
    url: 'https://etherscan.io',
    txPath: '/tx/{hash}',
  },

  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },

  gasEstimation: {
    defaultGasLimit: BigInt(21000),
    eip1559: true,
    eip1559Factor: 2,
  },

  staleness: {
    maxAgeMs: 60 * 60 * 1000,
    maxConfirmationTimeMs: 15 * 60 * 1000,
    maxRetries: 3,
    retryDelayMs: 5000,
  },

  contracts: {
    // No reviewed Ethereum mainnet deployment in the pinned release; leave unset.
  },

  features: {
    supportsEIP1559: true,
    supportsEIP4844: true,
    supportsAccessList: true,
    supportsSimulation: true,
  },

  validation: {
    minConfirmations: 1,
    minSafeConfirmations: 5,
    minFinalConfirmations: 32,
    addressVersion: 1,
  },
};

/**
 * Canonical chain configurations by ID
 */
export const CHAIN_CONFIGS: Record<number, ChainFinality> = {
  [OPTIMISM_MAINNET.id]: OPTIMISM_MAINNET,
  [OPTIMISM_SEPOLIA.id]: OPTIMISM_SEPOLIA,
  [BASE_MAINNET.id]: BASE_MAINNET,
  [ETHEREUM_MAINNET.id]: ETHEREUM_MAINNET,
};

/**
 * Get chain config by ID
 * @throws Error if chain not found
 */
export function getChainConfig(chainId: number): ChainFinality {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return config;
}

/**
 * Check if a chain is canonical (supported)
 */
export function isSupportedChain(chainId: number): boolean {
  return chainId in CHAIN_CONFIGS;
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(CHAIN_CONFIGS).map(Number);
}
