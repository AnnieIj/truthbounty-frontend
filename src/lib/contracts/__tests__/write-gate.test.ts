import {
  evaluateWriteTarget,
  assertWriteReady,
  WriteGateError,
} from '@/lib/contracts/write-gate';
import type { LoadedReleaseArtifacts } from '@/lib/contracts/types';

const RELEASE_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const OTHER_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const STELLAR_ADDRESS = 'GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKIB';

function makeRelease(
  overrides?: Partial<LoadedReleaseArtifacts['manifest']>,
  addressOverrides?: Partial<LoadedReleaseArtifacts['addresses']>
): LoadedReleaseArtifacts {
  return {
    manifest: {
      protocolVersion: '2.0.0',
      releaseId: 'v2.0.0-sepolia',
      gitCommit: '5333c0acb9ccfb8a6a37ae76b3397d06781f0119',
      compilerVersion: 'foundry-0.2.0',
      chainId: 11155420,
      deploymentBlock: 0,
      abiVersion: '2.0.0',
      eventSchemaVersion: '2.0.0',
      parameterSetVersion: '2.0.0',
      contracts: {
        TruthBountyWeighted: {
          proxy: RELEASE_ADDRESS,
          implementation: RELEASE_ADDRESS,
        },
      },
      ...overrides,
    },
    addresses: {
      chainId: 11155420,
      TruthBountyWeighted: RELEASE_ADDRESS,
      ...addressOverrides,
    },
    abis: { TruthBountyWeighted: [] },
    events: { version: '2.0.0', events: [] },
    parameters: {},
    roles: {},
    checksums: { version: '1', files: {} },
  };
}

describe('write-gate (V2-FE-043)', () => {
  it('accepts matching chain, release address, and protocol version', () => {
    const result = evaluateWriteTarget({
      activeChainId: 11155420,
      contractAddress: RELEASE_ADDRESS,
      expectedProtocolVersion: '2.0.0',
      release: makeRelease(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.address.toLowerCase()).toBe(RELEASE_ADDRESS.toLowerCase());
      expect(result.chainId).toBe(11155420);
      expect(result.protocolVersion).toBe('2.0.0');
      expect(result.provenance.releaseId).toBe('v2.0.0-sepolia');
      expect(result.provenance.gitCommit).toMatch(/^[0-9a-f]{40}$/i);
    }
  });

  it('fails closed on wrong chain before signing', () => {
    const result = evaluateWriteTarget({
      activeChainId: 1,
      contractAddress: RELEASE_ADDRESS,
      release: makeRelease(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('WRONG_CHAIN');
      expect(result.errors.join(' ')).toMatch(/Wrong chain/i);
    }
    expect(result.address).toBeNull();
  });

  it('fails closed on wrong address before signing', () => {
    const result = evaluateWriteTarget({
      activeChainId: 11155420,
      contractAddress: OTHER_ADDRESS,
      release: makeRelease(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('WRONG_ADDRESS');
      expect(result.errors.join(' ')).toMatch(/does not match release/i);
    }
  });

  it('fails closed on stale artifact version before signing', () => {
    const result = evaluateWriteTarget({
      activeChainId: 11155420,
      expectedProtocolVersion: '1.0.0',
      release: makeRelease(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('STALE_ARTIFACT');
      expect(result.errors.join(' ')).toMatch(/Stale artifact/i);
    }
  });

  it('fails closed on placeholder/zero release addresses', () => {
    const zeroRelease = makeRelease(undefined, { TruthBountyWeighted: ZERO_ADDRESS });
    const result = evaluateWriteTarget({
      activeChainId: 11155420,
      release: zeroRelease,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PLACEHOLDER_ADDRESS');
    }
  });

  it('fails closed on Stellar legacy addresses', () => {
    const stellarRelease = makeRelease(undefined, {
      TruthBountyWeighted: STELLAR_ADDRESS as `0x${string}`,
    });
    const result = evaluateWriteTarget({
      activeChainId: 11155420,
      release: stellarRelease,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/Stellar/i);
    }
  });

  it('fails closed on caller placeholder override address', () => {
    const result = evaluateWriteTarget({
      activeChainId: 11155420,
      contractAddress: ZERO_ADDRESS,
      release: makeRelease(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/Zero address/i);
    }
  });

  it('fails closed when release manifest cannot be loaded', () => {
    const result = evaluateWriteTarget({
      activeChainId: 11155420,
      release: {
        ...makeRelease(),
        manifest: undefined as unknown as LoadedReleaseArtifacts['manifest'],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('MISSING_MANIFEST');
    }
  });

  it('assertWriteReady throws WriteGateError on failure and returns provenance on success', () => {
    expect(() =>
      assertWriteReady({
        activeChainId: 10,
        release: makeRelease(),
      })
    ).toThrow(WriteGateError);

    const ok = assertWriteReady({
      activeChainId: 11155420,
      contractAddress: RELEASE_ADDRESS,
      expectedProtocolVersion: '2.0.0',
      release: makeRelease(),
    });
    expect(ok.provenance.releaseId).toBe('v2.0.0-sepolia');
    expect(ok.address.toLowerCase()).toBe(RELEASE_ADDRESS.toLowerCase());
  });
});