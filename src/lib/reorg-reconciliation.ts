/**
 * V2-FE-144 — Reorg / replacement reconciliation core (pure).
 *
 * The canonical API is a *projection* of chain state. When the chain reorganizes,
 * previously observed receipts (and every projection derived from them) can be
 * orphaned. The backend notifies clients with `ROLLBACK` / `REPLACEMENT` events
 * (see `src/app/types/websocket.ts`); this module validates those projections and
 * derives:
 *   1. which react-query caches must be invalidated, and
 *   2. what the UI must display.
 *
 * Security invariants (fail-closed):
 *  - An event with missing/malformed/contradictory fields is treated as
 *    INVALID → the client marks affected data stale and NEVER presents success.
 *  - A reorged transaction is never "resolved" client-side: only a canonical
 *    replacement event can close a reorg outcome.
 *  - No hash, block number, cursor or outcome is ever fabricated here.
 *  - Pure module: no I/O, no randomness, no React — fully deterministic.
 */

import type { RollbackEvent, ReplacementEvent } from '@/app/types/websocket';

// ---------------------------------------------------------------------------
// Supported chains (canonical Optimism environments only)
// ---------------------------------------------------------------------------

export const RECONCILIATION_SUPPORTED_CHAIN_IDS = [10, 11155420] as const;

export type ReconciliationChainId = (typeof RECONCILIATION_SUPPORTED_CHAIN_IDS)[number];

export function isSupportedReconciliationChain(chainId: unknown): chainId is ReconciliationChainId {
  return (
    typeof chainId === 'number' &&
    (RECONCILIATION_SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId)
  );
}

// ---------------------------------------------------------------------------
// Hash helpers
// ---------------------------------------------------------------------------

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/** A 32-byte, 0x-prefixed transaction hash. */
export function isTxHash(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && TX_HASH_RE.test(value);
}

function normalizeHash(value: string): string {
  return value.toLowerCase();
}

function sameHash(a: string, b: string): boolean {
  return normalizeHash(a) === normalizeHash(b);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isBlockNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isInteger(value);
}

// ---------------------------------------------------------------------------
// Event validation
// ---------------------------------------------------------------------------

export type ReorgEventValidation<TEvent = RollbackEvent | ReplacementEvent> =
  | { ok: true; event: TEvent }
  | { ok: false; reason: 'malformed' | 'unknown-block' };

/**
 * Validate a raw ROLLBACK payload.
 * Required: lastValidCursor (non-empty), blockNumber (finite integer).
 */
export function validateRollbackEvent(payload: unknown): ReorgEventValidation<RollbackEvent> {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'malformed' };
  }
  const candidate = payload as Partial<RollbackEvent>;
  if (!isNonEmptyString(candidate.lastValidCursor)) {
    return { ok: false, reason: 'malformed' };
  }
  if (!isBlockNumber(candidate.blockNumber)) {
    return { ok: false, reason: 'unknown-block' };
  }
  return {
    ok: true,
    event: {
      lastValidCursor: candidate.lastValidCursor,
      blockNumber: candidate.blockNumber,
      affectedClaimIds: candidate.affectedClaimIds,
      affectedVerificationIds: candidate.affectedVerificationIds,
    },
  };
}

/**
 * Validate a raw REPLACEMENT payload.
 * Required: newData, previousCursor, newCursor (non-empty), blockNumber.
 */
export function validateReplacementEvent(payload: unknown): ReorgEventValidation<ReplacementEvent> {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'malformed' };
  }
  const candidate = payload as Partial<ReplacementEvent>;
  if (
    candidate.newData === undefined ||
    !isNonEmptyString(candidate.previousCursor) ||
    !isNonEmptyString(candidate.newCursor) ||
    candidate.previousCursor === candidate.newCursor
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (!isBlockNumber(candidate.blockNumber)) {
    return { ok: false, reason: 'unknown-block' };
  }
  return {
    ok: true,
    event: {
      claimId: candidate.claimId,
      verificationId: candidate.verificationId,
      newData: candidate.newData,
      previousCursor: candidate.previousCursor,
      newCursor: candidate.newCursor,
      blockNumber: candidate.blockNumber,
    },
  };
}

// ---------------------------------------------------------------------------
// Tracked transaction state machine
// ---------------------------------------------------------------------------

/**
 * Projection-facing state for a transaction the user submitted and the
 * frontend previously observed a receipt for (or is waiting for).
 *
 * This is deliberately narrower than the on-chain machine
 * (`src/lib/transaction-machine`): it only tracks the reorg-facing surface.
 */
export type TrackedTxStatus =
  | 'submitted' // hash from wallet; receipt not yet observed
  | 'confirmed' // canonical receipt observed (success or reverted at execution)
  | 'reorged' // previously observed receipt was orphaned
  | 'replaced' // superseded by a canonical replacement transaction
  | 'dropped'; // reconciliation could not complete; fail closed

export interface TrackedTransaction {
  /** Wallet/`RPC`-returned hash — the only accepted origin. */
  readonly hash: `0x${string}`;
  readonly chainId: number;
  readonly status: TrackedTxStatus;
  /** Hash of the canonical replacement (status `replaced` only). */
  readonly replacedBy?: `0x${string}`;
}

export class ReorgReconciliationError extends Error {
  readonly code: 'INVALID_HASH' | 'INVALID_CHAIN' | 'INVALID_REPLACEMENT' | 'NOT_REORGED' | 'STALE_EVENT';

  constructor(code: ReorgReconciliationError['code'], message: string) {
    super(message);
    this.name = 'ReorgReconciliationError';
    this.code = code;
  }
}

function assertTracked(tx: TrackedTransaction): void {
  if (!isTxHash(tx.hash)) {
    throw new ReorgReconciliationError(
      'INVALID_HASH',
      'tracked transaction hash must be a 32-byte 0x-prefixed hash (wallet-provided)',
    );
  }
  if (!isSupportedReconciliationChain(tx.chainId)) {
    throw new ReorgReconciliationError(
      'INVALID_CHAIN',
      `chainId ${String(tx.chainId)} is not a supported Optimism chain`,
    );
  }
}

/**
 * Mark a tracked transaction as reorged after a validated ROLLBACK.
 * The previous receipt is discarded — success is withdrawn, never faked.
 */
export function markReorged(tx: TrackedTransaction): TrackedTransaction {
  assertTracked(tx);
  if (tx.status === 'reorged') {
    // Idempotent: reorg already applied.
    return tx;
  }
  if (tx.status === 'replaced' || tx.status === 'dropped') {
    throw new ReorgReconciliationError(
      'NOT_REORGED',
      `cannot reorg a transaction already in terminal state '${tx.status}'`,
    );
  }
  return { ...tx, status: 'reorged', replacedBy: undefined };
}

/**
 * Close a reorg outcome with a canonical replacement hash delivered by a
 * validated REPLACEMENT event. Clients must never invent this hash.
 */
export function resolveReorgWithReplacement(
  tx: TrackedTransaction,
  replacementHash: `0x${string}`,
): TrackedTransaction {
  assertTracked(tx);
  if (!isTxHash(replacementHash)) {
    throw new ReorgReconciliationError(
      'INVALID_REPLACEMENT',
      'replacement hash must be a 32-byte 0x-prefixed hash from the canonical event',
    );
  }
  if (tx.status !== 'reorged') {
    throw new ReorgReconciliationError(
      'NOT_REORGED',
      `replacement can only close a 'reorged' transaction (got '${tx.status}')`,
    );
  }
  if (sameHash(tx.hash, replacementHash)) {
    throw new ReorgReconciliationError(
      'INVALID_REPLACEMENT',
      'replacement hash must differ from the orphaned hash',
    );
  }
  return { ...tx, status: 'replaced', replacedBy: normalizeHash(replacementHash) as `0x${string}` };
}

// ---------------------------------------------------------------------------
// Cache invalidation plan
// ---------------------------------------------------------------------------

export interface ReorgInvalidatePlan {
  /** React-query key roots to invalidate. */
  readonly queryKeyRoots: readonly string[];
  /** Specific claim ids surfaced by the event (best-effort, may be absent). */
  readonly affectedClaimIds: readonly string[];
  /** Specific verification ids surfaced by the event (best-effort, may be absent). */
  readonly affectedVerificationIds: readonly string[];
  /** True when the event must also reset the resumable WebSocket cursor. */
  readonly resetCursor: boolean;
  /** Cursor to resume from (rollback: `lastValidCursor`; replacement: `newCursor`). */
  readonly resumeCursor: string;
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * Compute the invalidation plan for a validated ROLLBACK event.
 * Every claim/verification projection is invalidated — the API projection is
 * only trustworthy again after a refetch from `lastValidCursor`.
 */
export function planRollbackInvalidation(event: RollbackEvent): ReorgInvalidatePlan {
  return {
    queryKeyRoots: ['claims', 'verifications', 'disputes', 'leaderboard', 'user'],
    affectedClaimIds: unique((event.affectedClaimIds ?? []).filter(isNonEmptyString)),
    affectedVerificationIds: unique((event.affectedVerificationIds ?? []).filter(isNonEmptyString)),
    resetCursor: true,
    resumeCursor: event.lastValidCursor,
  };
}

/**
 * Compute the invalidation plan for a validated REPLACEMENT event.
 * Scoped to the affected claim (when provided) plus the claim feed root.
 */
export function planReplacementInvalidation(event: ReplacementEvent): ReorgInvalidatePlan {
  const affectedClaims = event.claimId ? [event.claimId] : [];
  return {
    queryKeyRoots: event.claimId ? ['claims', 'verifications'] : ['claims'],
    affectedClaimIds: unique(affectedClaims.filter(isNonEmptyString)),
    affectedVerificationIds: unique(
      (event.verificationId ? [event.verificationId] : []).filter(isNonEmptyString),
    ),
    resetCursor: false,
    resumeCursor: event.newCursor,
  };
}

// ---------------------------------------------------------------------------
// Banner view state
// ---------------------------------------------------------------------------

export type ReorgBannerState =
  | 'hidden' // nothing to report
  | 'reorg-detected' // reorg observed; success withdrawn; reconciling
  | 'replacement-found' // canonical replacement observed; follow the new hash
  | 'unresolved'; // reconciliation failed/stale — treat data as stale

export interface ReorgBannerView {
  readonly state: ReorgBannerState;
  /** Short, non-authoritative message. Never claims protocol outcomes. */
  readonly message: string;
  /** Additional guidance for the user. */
  readonly detail: string;
  /** Orphaned hash to display (truncated by the component), when present. */
  readonly orphanedHash: `0x${string}` | null;
  /** Canonical replacement hash to display, when present. */
  readonly replacementHash: `0x${string}` | null;
  /** True when a screen-reader announcement must be assertive. */
  readonly assertive: boolean;
}

/**
 * Derive the accessible banner view from the tracked transaction plus the
 * latest validated event outcome. Pure and deterministic.
 *
 * A validated ROLLBACK must surface even when no specific transaction is
 * tracked (`rollbackDetected`): the UI must make chain uncertainty visible
 * and reconcile projections, never silently keep stale success state.
 */
export function buildReorgBannerView(
  tx: TrackedTransaction | null,
  options: { reconciliationFailed?: boolean; rollbackDetected?: boolean } = {},
): ReorgBannerView {
  if (options.reconciliationFailed) {
    return {
      state: 'unresolved',
      message: 'Chain reorganization could not be reconciled.',
      detail:
        'Recent activity may be stale. Wait for canonical data before acting; nothing was confirmed.',
      orphanedHash: null,
      replacementHash: null,
      assertive: true,
    };
  }

  if (tx && tx.status === 'reorged') {
    return {
      state: 'reorg-detected',
      message: 'Chain reorganization detected.',
      detail:
        'A transaction you submitted was removed from the canonical chain. ' +
        'Its outcome is no longer valid and any success notice has been withdrawn. ' +
        'Waiting for canonical data.',
      orphanedHash: tx.hash,
      replacementHash: tx.replacedBy ?? null,
      assertive: true,
    };
  }

  if (options.rollbackDetected) {
    return {
      state: 'reorg-detected',
      message: 'Chain reorganization detected.',
      detail:
        'The chain reorganized recently. Projected activity is being reconciled ' +
        'with the canonical chain; success notices for affected actions may be withdrawn. ' +
        'Waiting for canonical data.',
      orphanedHash: null,
      replacementHash: null,
      assertive: true,
    };
  }

  return {
    state: 'hidden',
    message: '',
    detail: '',
    orphanedHash: null,
    replacementHash: null,
    assertive: false,
  };
}

/**
 * Derive the banner view for a *replacement* observation (validated event with
 * a known replacement hash), regardless of whether the tx was tracked as
 * reorged first. Used by the hook when a REPLACEMENT event closes a reorg.
 */
export function buildReplacementBannerView(
  orphanedHash: `0x${string}` | null,
  replacementHash: `0x${string}`,
): ReorgBannerView {
  if (!isTxHash(replacementHash)) {
    return {
      state: 'unresolved',
      message: 'Replacement event could not be validated.',
      detail: 'Recent activity may be stale. Wait for canonical data before acting.',
      orphanedHash: null,
      replacementHash: null,
      assertive: true,
    };
  }
  return {
    state: 'replacement-found',
    message: 'Transaction replaced by the canonical chain.',
    detail:
      'The original transaction was superseded. Follow the replacement transaction ' +
      'for the current outcome; the original result no longer applies.',
    orphanedHash,
    replacementHash,
    assertive: true,
  };
}
