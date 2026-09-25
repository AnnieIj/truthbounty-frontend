/**
 * Integration Tests - Chain Configuration and Wallet Integration
 *
 * Tests for chain configuration loading, chain validation, and wallet state management.
 * Ensures no hardcoded assumptions and proper canonical chain support.
 */

import {
  getChainConfig,
  isSupportedChain,
  getSupportedChainIds,
  OPTIMISM_MAINNET,
  OPTIMISM_SEPOLIA,
  BASE_MAINNET,
  ETHEREUM_MAINNET,
} from '@/config/chains';

describe('Chain Configuration System', () => {
  test('all canonical chains are properly configured', () => {
    const chains = [OPTIMISM_MAINNET, OPTIMISM_SEPOLIA, BASE_MAINNET, ETHEREUM_MAINNET];

    chains.forEach((chain) => {
      expect(chain.id).toBeGreaterThan(0);
      expect(chain.name).toBeTruthy();
      expect(chain.slug).toBeTruthy();
      expect(chain.rpcUrl).toBeTruthy();
      expect(chain.blockExplorer).toBeTruthy();
      expect(chain.nativeCurrency).toBeTruthy();
      expect(chain.gasEstimation).toBeTruthy();
      expect(chain.validation).toBeTruthy();
    });
  });

  test('Optimism mainnet has correct L2 parameters', () => {
    const chain = OPTIMISM_MAINNET;

    expect(chain.isL2).toBe(true);
    expect(chain.parentChainId).toBe(1); // Ethereum mainnet
    expect(chain.id).toBe(10);
    expect(chain.blockTimeMs).toBe(2000);
    expect(chain.finalityTimeMs).toBe(12 * 60 * 1000); // ~12 minutes
  });

  test('Base mainnet inherits Optimism stack properties', () => {
    const chain = BASE_MAINNET;

    expect(chain.isL2).toBe(true);
    expect(chain.parentChainId).toBe(1);
    expect(chain.blockTimeMs).toBe(2000);
    expect(chain.batchIntervalMs).toBe(60 * 1000);
  });

  test('Ethereum mainnet is correctly configured as L1', () => {
    const chain = ETHEREUM_MAINNET;

    expect(chain.isL2).toBe(false);
    expect(chain.parentChainId).toBeUndefined();
    expect(chain.id).toBe(1);
    expect(chain.blockTimeMs).toBe(12000); // 12 seconds
    expect(chain.finalityTimeMs).toBe(12 * 60 * 1000); // 12 minutes
  });

  test('getChainConfig returns correct chain', () => {
    const optimism = getChainConfig(10);
    expect(optimism.id).toBe(10);
    expect(optimism.name).toBe('Optimism');

    const base = getChainConfig(8453);
    expect(base.id).toBe(8453);
    expect(base.name).toBe('Base');
  });

  test('getChainConfig throws for unsupported chain', () => {
    expect(() => getChainConfig(99999)).toThrow(/unsupported/i);
  });

  test('isSupportedChain correctly identifies canonical chains', () => {
    expect(isSupportedChain(10)).toBe(true);
    expect(isSupportedChain(11155420)).toBe(true);
    expect(isSupportedChain(8453)).toBe(true);
    expect(isSupportedChain(1)).toBe(true);
    expect(isSupportedChain(99999)).toBe(false);
  });

  test('getSupportedChainIds returns all canonical chains', () => {
    const chainIds = getSupportedChainIds();

    expect(chainIds).toContain(10); // Optimism mainnet
    expect(chainIds).toContain(11155420); // Optimism Sepolia
    expect(chainIds).toContain(8453); // Base
    expect(chainIds).toContain(1); // Ethereum mainnet
    expect(chainIds.length).toBeGreaterThanOrEqual(4);
  });

  test('all chain RPC URLs are valid', () => {
    const chains = [OPTIMISM_MAINNET, OPTIMISM_SEPOLIA, BASE_MAINNET, ETHEREUM_MAINNET];

    chains.forEach((chain) => {
      expect(chain.rpcUrl).toMatch(/^https:\/\//);
      if (chain.rpcUrls) {
        chain.rpcUrls.forEach((url) => {
          expect(url).toMatch(/^https:\/\//);
        });
      }
    });
  });

  test('all chain explorers have valid configuration', () => {
    const chains = [OPTIMISM_MAINNET, OPTIMISM_SEPOLIA, BASE_MAINNET, ETHEREUM_MAINNET];

    chains.forEach((chain) => {
      expect(chain.blockExplorer.name).toBeTruthy();
      expect(chain.blockExplorer.url).toMatch(/^https:\/\//);
      expect(chain.blockExplorer.txPath).toContain('{hash}');
    });
  });

  test('confirmation thresholds are ordered correctly', () => {
    const chains = [OPTIMISM_MAINNET, OPTIMISM_SEPOLIA, BASE_MAINNET, ETHEREUM_MAINNET];

    chains.forEach((chain) => {
      expect(chain.confirmationBlocks).toBeGreaterThan(0);
      expect(chain.safeBlocks).toBeGreaterThanOrEqual(chain.confirmationBlocks);
      expect(chain.finalizedBlocks).toBeGreaterThanOrEqual(chain.safeBlocks);
    });
  });

  test('timing expectations match block times', () => {
    const chains = [OPTIMISM_MAINNET, BASE_MAINNET];

    chains.forEach((chain) => {
      // Confirmation time should be roughly blockTime * confirmationBlocks
      const expectedConfTime = chain.blockTimeMs * chain.confirmationBlocks;
      expect(chain.confirmationTimeMs).toBeLessThanOrEqual(expectedConfTime * 2);
      expect(chain.confirmationTimeMs).toBeGreaterThan(0);
    });
  });

  test('staleness config prevents premature state claims', () => {
    const chains = [OPTIMISM_MAINNET, OPTIMISM_SEPOLIA, BASE_MAINNET, ETHEREUM_MAINNET];

    chains.forEach((chain) => {
      expect(chain.staleness.maxAgeMs).toBeGreaterThan(0);
      expect(chain.staleness.maxConfirmationTimeMs).toBeGreaterThan(0);
      expect(chain.staleness.maxRetries).toBeGreaterThan(0);
      expect(chain.staleness.retryDelayMs).toBeGreaterThan(0);

      // Max confirmation time should be less than max age
      expect(chain.staleness.maxConfirmationTimeMs).toBeLessThanOrEqual(chain.staleness.maxAgeMs);
    });
  });

  test('contract addresses are properly formatted', () => {
    const chains = [OPTIMISM_MAINNET, OPTIMISM_SEPOLIA, BASE_MAINNET];

    chains.forEach((chain) => {
      if (chain.contracts.truthBounty) {
        expect(chain.contracts.truthBounty).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(chain.contracts.truthBounty?.toLowerCase()).not.toBe(
          '0x0000000000000000000000000000000000000000'
        );
      }
      if (chain.contracts.token) {
        expect(chain.contracts.token).toMatch(/^0x[a-fA-F0-9]{40}$/);
      }
    });
  });

  test('no chain config ships a zero/placeholder truthBounty address', () => {
    const chains = [OPTIMISM_MAINNET, OPTIMISM_SEPOLIA, BASE_MAINNET, ETHEREUM_MAINNET];

    chains.forEach((chain) => {
      expect(chain.contracts.truthBounty).not.toBe(
        '0x0000000000000000000000000000000000000000'
      );
      if (chain.contracts.truthBounty) {
        expect(chain.contracts.truthBounty).not.toMatch(/placeholder|dummy|yourcontract/i);
      }
    });
  });

  test('sepolia contract address is bound to the release manifest when deployed', () => {
    if (OPTIMISM_SEPOLIA.contracts.truthBounty) {
      expect(OPTIMISM_SEPOLIA.contracts.truthBounty).toBe(
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
      );
    }
  });

  test('feature flags are consistent across chains', () => {
    const chains = [OPTIMISM_MAINNET, BASE_MAINNET];

    chains.forEach((chain) => {
      expect(chain.features.supportsEIP1559).toBe(true);
      expect(chain.features.supportsAccessList).toBe(true);
      expect(chain.features.supportsSimulation).toBe(true);
    });
  });

  test('validation rules enforce minimums', () => {
    const chains = [OPTIMISM_MAINNET, OPTIMISM_SEPOLIA, BASE_MAINNET, ETHEREUM_MAINNET];

    chains.forEach((chain) => {
      expect(chain.validation.minConfirmations).toBeGreaterThan(0);
      expect(chain.validation.minSafeConfirmations).toBeGreaterThanOrEqual(chain.validation.minConfirmations);
      expect(chain.validation.minFinalConfirmations).toBeGreaterThanOrEqual(chain.validation.minSafeConfirmations);
    });
  });

  test('L2 chains have proper batch parameters', () => {
    const l2Chains = [OPTIMISM_MAINNET, OPTIMISM_SEPOLIA, BASE_MAINNET];

    l2Chains.forEach((chain) => {
      expect(chain.batchIntervalMs).toBeGreaterThan(0);
      expect(chain.l1ConfirmationsRequired).toBeGreaterThan(0);
      expect(chain.sequencerFeeFactor).toBeGreaterThan(0);
    });
  });
});

describe('Chain Configuration Integration', () => {
  test('can fetch config for all supported chains without errors', () => {
    const chainIds = getSupportedChainIds();

    chainIds.forEach((chainId) => {
      expect(() => getChainConfig(chainId)).not.toThrow();
    });
  });

  test('chain config can be used to validate block explorer URLs', () => {
    const chains = [OPTIMISM_MAINNET, BASE_MAINNET, ETHEREUM_MAINNET];

    chains.forEach((chain) => {
      const txUrl = chain.blockExplorer.url + chain.blockExplorer.txPath.replace('{hash}', '0xabcd1234');
      expect(txUrl).toMatch(/^https:\/\/.+\/tx\/.+/);
    });
  });

  test('chain gas limits are reasonable', () => {
    const chains = [OPTIMISM_MAINNET, BASE_MAINNET, ETHEREUM_MAINNET];

    chains.forEach((chain) => {
      expect(chain.gasEstimation.defaultGasLimit).toBeGreaterThan(BigInt(0));
      expect(chain.gasEstimation.defaultGasLimit).toBeLessThan(BigInt(10_000_000));
    });
  });
});
