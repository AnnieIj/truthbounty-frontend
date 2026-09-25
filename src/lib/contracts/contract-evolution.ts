/**
 * V2-FE-088 — Component Contract Tests helpers for API and ABI evolution.
 *
 * Pins the frontend's expected ABI surface, event schema fields, manifest
 * versions, enums, and API projection shapes so evolution is explicit and
 * fail-closed. Fixtures under `__fixtures__/` are the versioned contract;
 * production never fabricates calldata, receipts, or settlement state.
 */

import type { Abi } from 'viem';
import type {
  Claim,
  ClaimCreationErrorCode,
  ClaimStatus,
} from '@/app/types/claim';
import type { SettlementState } from '@/app/types/settlement';
import type { ReleaseManifest } from './types';
import { getProtocolRelease } from './registry';

/** Canonical ABI function names the UI may encode against (v2.0.0). */
export const REQUIRED_ABI_FUNCTIONS_V2 = [
  'balanceOf',
  'claimRewards',
  'settleProvisional',
  'settleAppeal',
  'finalize',
] as const;

/** Mutation functions — must remain nonpayable / non-view. */
export const MUTATION_ABI_FUNCTIONS_V2 = [
  'claimRewards',
  'settleProvisional',
  'settleAppeal',
  'finalize',
] as const;

/** Event names required by projection / receipt reconciliation. */
export const REQUIRED_EVENT_NAMES_V2 = [
  'ClaimSettled',
  'RewardsClaimed',
] as const;

export const CLAIM_STATUSES_V2: readonly ClaimStatus[] = [
  'OPEN',
  'UNDER_REVIEW',
  'VERIFIED',
  'REJECTED',
  'DISPUTED',
] as const;

export const SETTLEMENT_STATES_V2: readonly SettlementState[] = [
  'PENDING_SETTLEMENT',
  'SETTLED',
  'SETTLEMENT_CLAIMED',
  'PENDING_APPEAL',
  'APPEAL_SETTLED',
  'APPEAL_CLAIMED',
  'FINALIZED',
] as const;

export const CLAIM_CREATION_ERROR_CODES_V2: readonly ClaimCreationErrorCode[] = [
  'UNSUPPORTED_CHAIN',
  'INVALID_ADDRESS',
  'INVALID_ARTIFACT_VERSION',
  'INVALID_WALLET_ACCOUNT',
  'INVALID_AMOUNT',
  'INVALID_CONTENT',
  'ALLOWANCE_NOT_APPROVED',
  'SIMULATION_REVERTED',
  'USER_REJECTED',
  'STALE_RECONMILITATION',
  'UNKNOWN',
] as const;

export type AbiItemLike = {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: readonly unknown[];
  outputs?: readonly unknown[];
};

export type EventSchemaLike = {
  version: string;
  events: readonly { name: string; signature: string }[];
};

export type ApiProjectionFixture = {
  version: string;
  claims: Claim[];
  errors: { code: ClaimCreationErrorCode; message: string }[];
  settlements: { claimId: string; state: SettlementState }[];
};

export type ContractValidationIssue = {
  code:
    | 'MISSING_ABI_FUNCTION'
    | 'UNEXPECTED_VIEW_MUTATION'
    | 'MISSING_EVENT'
    | 'MANIFEST_VERSION_MISMATCH'
    | 'UNKNOWN_ENUM'
    | 'INVALID_PROJECTION'
    | 'PLACEHOLDER_IN_ABI';
  message: string;
};

const PLACEHOLDER_RE = /placeholder|dummy|mock|todo|example/i;

function isAbiItem(value: unknown): value is AbiItemLike {
  return typeof value === 'object' && value !== null;
}

/**
 * Validate that an ABI retains the required v2 surface and that mutation
 * functions are not silently downgraded to view/pure.
 */
export function validateAbiSurface(
  abi: readonly unknown[],
  requiredFunctions: readonly string[] = REQUIRED_ABI_FUNCTIONS_V2,
  mutationFunctions: readonly string[] = MUTATION_ABI_FUNCTIONS_V2,
): ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];
  const functions = abi.filter(
    (item): item is AbiItemLike =>
      isAbiItem(item) && item.type === 'function' && typeof item.name === 'string',
  );
  const byName = new Map(functions.map((fn) => [fn.name!, fn]));

  for (const name of requiredFunctions) {
    if (!byName.has(name)) {
      issues.push({
        code: 'MISSING_ABI_FUNCTION',
        message: `Required ABI function missing: ${name}`,
      });
    }
  }

  for (const name of mutationFunctions) {
    const fn = byName.get(name);
    if (!fn) continue;
    if (fn.stateMutability === 'view' || fn.stateMutability === 'pure') {
      issues.push({
        code: 'UNEXPECTED_VIEW_MUTATION',
        message: `Mutation function ${name} must not be ${fn.stateMutability}`,
      });
    }
  }

  const serialized = JSON.stringify(abi);
  if (PLACEHOLDER_RE.test(serialized)) {
    issues.push({
      code: 'PLACEHOLDER_IN_ABI',
      message: 'ABI contains placeholder/dummy/mock tokens',
    });
  }

  return issues;
}

/**
 * Validate event schema names and signatures against the pinned contract.
 */
export function validateEventSchema(
  schema: EventSchemaLike,
  requiredEvents: readonly string[] = REQUIRED_EVENT_NAMES_V2,
): ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];
  const byName = new Map(schema.events.map((e) => [e.name, e]));

  for (const name of requiredEvents) {
    const entry = byName.get(name);
    if (!entry) {
      issues.push({
        code: 'MISSING_EVENT',
        message: `Required event missing: ${name}`,
      });
      continue;
    }
    if (!entry.signature.includes(name) || !entry.signature.includes('(')) {
      issues.push({
        code: 'MISSING_EVENT',
        message: `Event ${name} has invalid signature: ${entry.signature}`,
      });
    }
  }

  return issues;
}

/**
 * Fail closed when manifest ABI / event / protocol versions diverge.
 */
export function validateManifestVersions(
  manifest: ReleaseManifest,
  expected: {
    protocolVersion: string;
    abiVersion: string;
    eventSchemaVersion: string;
  },
): ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];
  const checks: Array<[string, string, string]> = [
    ['protocolVersion', manifest.protocolVersion, expected.protocolVersion],
    ['abiVersion', manifest.abiVersion, expected.abiVersion],
    ['eventSchemaVersion', manifest.eventSchemaVersion, expected.eventSchemaVersion],
  ];

  for (const [field, actual, want] of checks) {
    if (actual !== want) {
      issues.push({
        code: 'MANIFEST_VERSION_MISMATCH',
        message: `${field}: got ${actual}, expected ${want}`,
      });
    }
  }

  return issues;
}

export function isKnownClaimStatus(value: string): value is ClaimStatus {
  return (CLAIM_STATUSES_V2 as readonly string[]).includes(value);
}

export function isKnownSettlementState(value: string): value is SettlementState {
  return (SETTLEMENT_STATES_V2 as readonly string[]).includes(value);
}

export function isKnownErrorCode(value: string): value is ClaimCreationErrorCode {
  return (CLAIM_CREATION_ERROR_CODES_V2 as readonly string[]).includes(value);
}

/**
 * Validate an API projection fixture (claims + errors + settlements).
 * Unknown enums / missing required fields fail closed.
 */
export function validateApiProjection(
  fixture: ApiProjectionFixture,
): ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];

  if (!fixture.version || typeof fixture.version !== 'string') {
    issues.push({
      code: 'INVALID_PROJECTION',
      message: 'API fixture missing version',
    });
  }

  for (const claim of fixture.claims ?? []) {
    if (!claim.id || !claim.title || !claim.claimantAddress) {
      issues.push({
        code: 'INVALID_PROJECTION',
        message: `Claim missing required fields: ${JSON.stringify(claim?.id)}`,
      });
    }
    if (!isKnownClaimStatus(claim.status)) {
      issues.push({
        code: 'UNKNOWN_ENUM',
        message: `Unknown ClaimStatus: ${String(claim.status)}`,
      });
    }
    if (
      typeof claim.claimantAddress === 'string' &&
      PLACEHOLDER_RE.test(claim.claimantAddress)
    ) {
      issues.push({
        code: 'INVALID_PROJECTION',
        message: `Claim ${claim.id} has placeholder claimantAddress`,
      });
    }
  }

  for (const err of fixture.errors ?? []) {
    if (!isKnownErrorCode(err.code)) {
      issues.push({
        code: 'UNKNOWN_ENUM',
        message: `Unknown ClaimCreationErrorCode: ${String(err.code)}`,
      });
    }
  }

  for (const row of fixture.settlements ?? []) {
    if (!isKnownSettlementState(row.state)) {
      issues.push({
        code: 'UNKNOWN_ENUM',
        message: `Unknown SettlementState: ${String(row.state)}`,
      });
    }
  }

  return issues;
}

/**
 * Backward-compatible claim status mapping for legacy API fixtures.
 * Unknown legacy values fail closed (null) — UI must show recovery, not guess.
 */
export function mapLegacyClaimStatus(raw: string): ClaimStatus | null {
  const normalized = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, ClaimStatus> = {
    OPEN: 'OPEN',
    UNDER_REVIEW: 'UNDER_REVIEW',
    IN_REVIEW: 'UNDER_REVIEW',
    REVIEW: 'UNDER_REVIEW',
    VERIFIED: 'VERIFIED',
    APPROVED: 'VERIFIED',
    REJECTED: 'REJECTED',
    DENIED: 'REJECTED',
    DISPUTED: 'DISPUTED',
  };
  return aliases[normalized] ?? null;
}

/**
 * Human-readable label for a claim status — used by components that render
 * projections. Keeps enum → UI mapping in one place for contract tests.
 */
export function claimStatusLabel(status: ClaimStatus): string {
  const labels: Record<ClaimStatus, string> = {
    OPEN: 'Open',
    UNDER_REVIEW: 'Under review',
    VERIFIED: 'Verified',
    REJECTED: 'Rejected',
    DISPUTED: 'Disputed',
  };
  return labels[status];
}

/**
 * Accessible feedback copy for async claim-list / rewards states.
 * Components under test assert these strings for loading / empty / error /
 * recovery — never timer-driven lifecycle guesses.
 */
export function asyncStateFeedback(
  state: 'loading' | 'empty' | 'success' | 'rejection' | 'error' | 'recovery',
): { role: 'status' | 'alert'; message: string } {
  switch (state) {
    case 'loading':
      return { role: 'status', message: 'Loading protocol projections…' };
    case 'empty':
      return { role: 'status', message: 'No claims match this projection.' };
    case 'success':
      return { role: 'status', message: 'Projections loaded from canonical API.' };
    case 'rejection':
      return {
        role: 'alert',
        message: 'Request rejected. Check wallet permissions and try again.',
      };
    case 'error':
      return {
        role: 'alert',
        message: 'Unable to load projections. Protocol state is unavailable.',
      };
    case 'recovery':
      return {
        role: 'status',
        message: 'Retry available. Reconcile against the latest confirmed receipt.',
      };
  }
}

/**
 * Snapshot the live pinned release for contract tests (no network).
 */
export function getPinnedContractSnapshot() {
  const release = getProtocolRelease();
  return {
    manifest: release.manifest,
    abi: release.abis.TruthBountyWeighted as readonly unknown[],
    events: release.events as EventSchemaLike,
    addresses: release.addresses,
  };
}

/** Type-only re-export so tests can assert Abi shape without importing viem in fixtures. */
export type { Abi };
