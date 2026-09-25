/**
 * V2-FE-043 — Single validated write gate.
 *
 * Every write path must resolve contract address, chain, and artifact version
 * through the versioned release manifest before any signing occurs.
 * Fail closed on wrong chain, wrong address, stale/missing artifacts, and
 * placeholder addresses.
 */

import { getAddressValidationError } from './address-guard';
import { getProtocolRelease, getReleaseChainId } from './registry';
import type { LoadedReleaseArtifacts, ReleaseManifest } from './types';

export type WriteGateErrorCode =
  | 'MISSING_MANIFEST'
  | 'WRONG_CHAIN'
  | 'WRONG_ADDRESS'
  | 'STALE_ARTIFACT'
  | 'PLACEHOLDER_ADDRESS'
  | 'CHAIN_UNSUPPORTED';

export class WriteGateError extends Error {
  readonly code: WriteGateErrorCode;
  readonly errors: string[];

  constructor(code: WriteGateErrorCode, errors: string[]) {
    super(errors.join('; '));
    this.name = 'WriteGateError';
    this.code = code;
    this.errors = errors;
  }
}

export interface WriteTargetProvenance {
  protocolVersion: string;
  releaseId: string;
  chainId: number;
  gitCommit: string;
  abiVersion: string;
  artifactPath: string;
}

export type WriteTargetEvaluation =
  | {
      ok: true;
      address: `0x${string}`;
      chainId: number;
      protocolVersion: string;
      provenance: WriteTargetProvenance;
      errors: [];
    }
  | {
      ok: false;
      address: null;
      chainId: number | null;
      protocolVersion: string | null;
      provenance: WriteTargetProvenance | null;
      errors: string[];
      code: WriteGateErrorCode;
    };

export interface EvaluateWriteTargetInput {
  /** Wallet / active chain id (must match the reviewed release chain). */
  activeChainId: number;
  /** Optional override address; must equal the release address when set. */
  contractAddress?: string | null;
  /** Optional caller-supplied artifact/protocol version for staleness checks. */
  expectedProtocolVersion?: string | null;
  /**
   * When true (default), `contractAddress` must equal the TruthBountyWeighted
   * release address. Set false for sibling contracts whose addresses are
   * pinned by a different reviewed path (e.g. verification artifact env)
   * while still enforcing chain + placeholder rules.
   */
  requireReleaseAddressMatch?: boolean;
  /** Injected release for tests; defaults to the app registry. */
  release?: LoadedReleaseArtifacts;
}

function loadReleaseOrError(
  release?: LoadedReleaseArtifacts
): { release: LoadedReleaseArtifacts | null; errors: string[] } {
  if (release) {
    return { release, errors: [] };
  }
  try {
    return { release: getProtocolRelease(), errors: [] };
  } catch (err) {
    return {
      release: null,
      errors: [
        `Release manifest unavailable: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

function classifyFailure(errors: string[]): WriteGateErrorCode {
  const joined = errors.join(' | ');
  if (/manifest unavailable|missing release/i.test(joined)) return 'MISSING_MANIFEST';
  if (/placeholder|zero address|invalid contract address/i.test(joined)) {
    return 'PLACEHOLDER_ADDRESS';
  }
  if (/stale/i.test(joined)) return 'STALE_ARTIFACT';
  if (/wrong address|address mismatch|does not match/i.test(joined)) {
    return 'WRONG_ADDRESS';
  }
  if (/wrong chain|active chain|chain id/i.test(joined)) return 'WRONG_CHAIN';
  return 'CHAIN_UNSUPPORTED';
}

/**
 * Pure evaluation of a write target against one validated release manifest.
 * Never signs; callers must refuse to proceed when `ok` is false.
 */
export function evaluateWriteTarget(
  input: EvaluateWriteTargetInput
): WriteTargetEvaluation {
  const errors: string[] = [];
  const { release, errors: loadErrors } = loadReleaseOrError(input.release);
  if (loadErrors.length > 0) {
    return {
      ok: false,
      address: null,
      chainId: null,
      protocolVersion: null,
      provenance: null,
      errors: loadErrors,
      code: 'MISSING_MANIFEST',
    };
  }

  const activeRelease = release as LoadedReleaseArtifacts;
  const manifest: ReleaseManifest = activeRelease.manifest;

  if (!manifest || typeof manifest.chainId !== 'number') {
    return {
      ok: false,
      address: null,
      chainId: null,
      protocolVersion: null,
      provenance: null,
      errors: ['Release manifest is missing required chain metadata'],
      code: 'MISSING_MANIFEST',
    };
  }

  const provenance: WriteTargetProvenance = {
    protocolVersion: manifest.protocolVersion,
    releaseId: manifest.releaseId,
    chainId: manifest.chainId,
    gitCommit: manifest.gitCommit,
    abiVersion: manifest.abiVersion,
    artifactPath: 'release',
  };

  if (input.activeChainId !== manifest.chainId) {
    errors.push(
      `Wrong chain: active chain ${input.activeChainId} is not the reviewed release chain ${manifest.chainId}`
    );
  }

  const releaseAddress =
    activeRelease.addresses?.TruthBountyWeighted ??
    manifest.contracts?.TruthBountyWeighted?.proxy;

  if (!releaseAddress) {
    errors.push('Release manifest does not pin a TruthBountyWeighted address');
  } else {
    const addressError = getAddressValidationError(releaseAddress);
    if (addressError) {
      errors.push(`Release address rejected: ${addressError}`);
    }
  }

  if (input.contractAddress != null && input.contractAddress !== '') {
    const override = input.contractAddress.trim();
    const overrideError = getAddressValidationError(override);
    if (overrideError) {
      errors.push(`Write target address rejected: ${overrideError}`);
    } else if (
      input.requireReleaseAddressMatch !== false &&
      releaseAddress &&
      override.toLowerCase() !== String(releaseAddress).toLowerCase()
    ) {
      errors.push(
        `Wrong address: ${override} does not match release manifest address ${releaseAddress}`
      );
    }
  }

  if (input.expectedProtocolVersion != null && input.expectedProtocolVersion !== '') {
    if (input.expectedProtocolVersion !== manifest.protocolVersion) {
      errors.push(
        `Stale artifact: expected protocol version ${input.expectedProtocolVersion}, release has ${manifest.protocolVersion}`
      );
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      address: null,
      chainId: manifest.chainId,
      protocolVersion: manifest.protocolVersion,
      provenance,
      errors,
      code: classifyFailure(errors),
    };
  }

  return {
    ok: true,
    address: releaseAddress as `0x${string}`,
    chainId: manifest.chainId,
    protocolVersion: manifest.protocolVersion,
    provenance,
    errors: [],
  };
}

/**
 * Throws `WriteGateError` when the write target is not safe to sign.
 * Returns the release address and provenance on success.
 */
export function assertWriteReady(input: EvaluateWriteTargetInput): {
  address: `0x${string}`;
  chainId: number;
  protocolVersion: string;
  provenance: WriteTargetProvenance;
} {
  const result = evaluateWriteTarget(input);
  if (!result.ok) {
    throw new WriteGateError(result.code, result.errors);
  }
  return {
    address: result.address,
    chainId: result.chainId,
    protocolVersion: result.protocolVersion,
    provenance: result.provenance,
  };
}

/** Canonical release chain id from the validated manifest. */
export function getWriteGateChainId(): number {
  return getReleaseChainId();
}
