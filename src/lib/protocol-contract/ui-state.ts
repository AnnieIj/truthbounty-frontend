/**
 * V2-FE-141 — Component-level protocol contract UI state model.
 *
 * Maps canonical Optimism/EVM protocol artifact readiness and an optional
 * caller-supplied transaction lifecycle into a single, fail-closed UI state.
 * Callers must supply lifecycle from real wallet/receipt evidence — this
 * module never invents hashes, confirmations, rewards, or settlement.
 */

import {
  getVerificationArtifact,
  type VerificationArtifact,
} from '@/config/protocol/verification-artifact';
import {
  getContractAddress,
  getProtocolDiagnostics,
  getProtocolVersion,
  getReleaseChainId,
} from '@/lib/contracts/registry';
import { isValidContractAddress } from '@/lib/contracts/address-guard';
import type { ProtocolDiagnostics } from '@/lib/contracts/types';

/** User-visible protocol / transaction lifecycle states required by V2-FE-141. */
export type ProtocolLifecycleState =
  | 'loading'
  | 'empty'
  | 'stale'
  | 'rejected'
  | 'failed'
  | 'pending'
  | 'confirmed'
  | 'finalized'
  | 'reorged';

/** Protocol artifact readiness (orthogonal to tx lifecycle). */
export type ProtocolReadiness =
  | 'ready'
  | 'unsupported_chain'
  | 'missing_config'
  | 'invalid_address';

export interface ProtocolContractSnapshot {
  readiness: ProtocolReadiness;
  lifecycle: ProtocolLifecycleState;
  artifact: VerificationArtifact;
  diagnostics: ProtocolDiagnostics;
  canonicalAddress: `0x${string}` | null;
  protocolVersion: string;
  releaseChainId: number;
  blockingReasons: string[];
  /** True only when mutation UI may render. */
  allowsMutation: boolean;
}

export interface ResolveProtocolContractUiInput {
  chainId: number;
  /** Must come from real provider/receipt evidence; never fabricate. */
  lifecycle?: ProtocolLifecycleState;
  /** Optional override for tests; defaults to live registry + env artifact. */
  artifact?: VerificationArtifact;
  diagnostics?: ProtocolDiagnostics;
  canonicalAddress?: string | null;
}

const BLOCKING_LIFECYCLES: ReadonlySet<ProtocolLifecycleState> = new Set([
  'loading',
  'stale',
  'rejected',
  'failed',
  'reorged',
]);

export function resolveProtocolReadiness(
  artifact: VerificationArtifact,
  canonicalAddress: string | null | undefined,
): { readiness: ProtocolReadiness; reasons: string[] } {
  const reasons = [...artifact.disabledReasons];

  if (!artifact.isDeployed) {
    const unsupported = reasons.some((r) => /not a supported verification chain/i.test(r));
    return {
      readiness: unsupported ? 'unsupported_chain' : 'missing_config',
      reasons,
    };
  }

  if (canonicalAddress != null && canonicalAddress !== '') {
    if (!isValidContractAddress(canonicalAddress)) {
      reasons.push('canonical TruthBountyWeighted address failed address-guard validation');
      return { readiness: 'invalid_address', reasons };
    }
  }

  return { readiness: 'ready', reasons: [] };
}

/**
 * Resolve the component-level protocol contract snapshot.
 * Fail closed: mutation is allowed only when readiness is ready and
 * lifecycle is not a blocking failure/uncertainty state.
 */
export function resolveProtocolContractUi(
  input: ResolveProtocolContractUiInput,
): ProtocolContractSnapshot {
  const artifact = input.artifact ?? getVerificationArtifact(input.chainId);
  const diagnostics = input.diagnostics ?? getProtocolDiagnostics();
  const protocolVersion = getProtocolVersion();
  const releaseChainId = getReleaseChainId();

  let canonicalAddress: `0x${string}` | null = null;
  if (input.canonicalAddress === null) {
    canonicalAddress = null;
  } else if (typeof input.canonicalAddress === 'string') {
    canonicalAddress = isValidContractAddress(input.canonicalAddress)
      ? input.canonicalAddress
      : (input.canonicalAddress as `0x${string}`);
  } else {
    try {
      canonicalAddress = getContractAddress('TruthBountyWeighted');
    } catch {
      canonicalAddress = null;
    }
  }

  const { readiness, reasons } = resolveProtocolReadiness(artifact, canonicalAddress);
  const lifecycle: ProtocolLifecycleState = input.lifecycle ?? 'empty';

  const blockingReasons = [...reasons];
  if (BLOCKING_LIFECYCLES.has(lifecycle)) {
    blockingReasons.push(`lifecycle state "${lifecycle}" blocks protocol mutation`);
  }

  const allowsMutation =
    readiness === 'ready' &&
    !BLOCKING_LIFECYCLES.has(lifecycle) &&
    lifecycle !== 'loading';

  return {
    readiness,
    lifecycle,
    artifact,
    diagnostics,
    canonicalAddress: isValidContractAddress(canonicalAddress) ? canonicalAddress : null,
    protocolVersion,
    releaseChainId,
    blockingReasons,
    allowsMutation,
  };
}

export const PROTOCOL_LIFECYCLE_LABELS: Record<ProtocolLifecycleState, string> = {
  loading: 'Loading protocol state',
  empty: 'No protocol transaction',
  stale: 'Stale protocol data',
  rejected: 'Wallet rejected the request',
  failed: 'Protocol lifecycle failed',
  pending: 'Protocol lifecycle pending',
  confirmed: 'Protocol lifecycle confirmed',
  finalized: 'Protocol lifecycle finalized',
  reorged: 'Block reorg detected',
};

export const PROTOCOL_READINESS_LABELS: Record<ProtocolReadiness, string> = {
  ready: 'Protocol ready',
  unsupported_chain: 'Unsupported chain',
  missing_config: 'Protocol configuration missing',
  invalid_address: 'Invalid contract address',
};
