import manifest from '../../../release/manifest.json';
import addresses from '../../../release/addresses/11155420.json';
import truthBountyWeightedAbi from '../../../release/abi/TruthBountyWeighted.json';
import eventSchema from '../../../release/events/event-schema.json';
import parameters from '../../../release/parameters/11155420.json';
import roles from '../../../release/roles/11155420.json';
import checksums from '../../../release/checksums.json';
import type { LoadedReleaseArtifacts, ProtocolDiagnostics } from './types';
import { assertValidContractAddress } from './address-guard';

const loaded: LoadedReleaseArtifacts = {
  manifest,
  addresses,
  abis: {
    TruthBountyWeighted: truthBountyWeightedAbi,
  },
  events: eventSchema,
  parameters,
  roles,
  checksums,
};

// Enforce valid canonical contract addresses at startup
assertValidContractAddress(loaded.addresses.TruthBountyWeighted, 'TruthBountyWeighted');
for (const [name, entry] of Object.entries(loaded.manifest.contracts || {})) {
  assertValidContractAddress(entry.proxy, `${name}.proxy`);
  assertValidContractAddress(entry.implementation, `${name}.implementation`);
}

export function getProtocolRelease(): LoadedReleaseArtifacts {
  return loaded;
}

export function getContractAddress(name: keyof typeof loaded.abis): `0x${string}` {
  if (name === 'TruthBountyWeighted') {
    return loaded.addresses.TruthBountyWeighted as `0x${string}`;
  }
  throw new Error(`Unknown contract: ${String(name)}`);
}

export function getContractAbi(name: keyof typeof loaded.abis) {
  return loaded.abis[name];
}

export function getProtocolVersion(): string {
  return loaded.manifest.protocolVersion;
}

export function getReleaseChainId(): number {
  return loaded.manifest.chainId;
}

export function getProtocolDiagnostics(): ProtocolDiagnostics {
  return {
    protocolVersion: loaded.manifest.protocolVersion,
    releaseId: loaded.manifest.releaseId,
    chainId: loaded.manifest.chainId,
    gitCommit: loaded.manifest.gitCommit,
    artifactPath: 'release',
    verifiedAt: new Date().toISOString(),
    abiVersion: loaded.manifest.abiVersion,
    abiHash: loaded.checksums.files['abi/TruthBountyWeighted.json'] ?? null,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    contracts: {
      TruthBountyWeighted: loaded.addresses.TruthBountyWeighted,
      ...Object.fromEntries(
        Object.entries(loaded.manifest.contracts || {}).map(([name, entry]) => [name, entry.proxy])
      ),
    },
  };
}

export { loaded as protocolRegistry };
