/**
 * Protocol time / deadline normalization.
 *
 * Protocol deadlines are derived from canonical chain data only:
 *   - a confirmed block header timestamp (anchor) and block number,
 *   - an ordinal target block (deadline expressed in blocks),
 *   - the protocol's expected block interval.
 *
 * This module NEVER fabricates timestamps, block numbers, hashes, receipts,
 * settlement, or finality. It fails closed: any missing, ambiguous, or
 * invalid input resolves to `null` / `UNKNOWN` rather than a client guess.
 * Lifecycle state is driven by canonical projections, never by timers.
 */

import { formatLocalDateTime, formatUtcDateTime } from './format';

export type DeadlineState = 'ACTIVE' | 'EXPIRED' | 'UNKNOWN';

export interface ChainClockAnchor {
  /** Confirmed block number this projection is anchored to. */
  anchorBlockNumber: bigint | number | string | null | undefined;
  /** Confirmed ms-epoch timestamp of the anchor block (from the block header). */
  anchorBlockTimestampMs: number | null | undefined;
  /** Protocol's expected seconds per block (e.g. 2s on Optimism). */
  avgBlockSeconds?: number | null | undefined;
}

export interface BlockDeadlineProjection {
  /** Absolute ms-epoch deadline derived from chain data, or null when fail-closed. */
  deadlineMs: number | null;
  /** Number of blocks between the anchor and the deadline block. */
  blockDelta: number | null;
  /** Canonical target (deadline) block number. */
  projectBlockNumber: bigint | null;
  /** Canonical anchor block number. */
  anchorBlockNumber: bigint | null;
  /** Expected seconds per block used for the projection. */
  avgBlockSeconds: number | null;
}

const EPSILON = Number.EPSILON;

/**
 * Normalize a chain block number (bigint | number | string) to `bigint`.
 * Returns null (fail closed) for missing, non-integer, negative, or
 * non-numeric input.
 */
export function normalizeBlockNumber(
  value: bigint | number | string | null | undefined
): bigint | null {
  if (value === null || value === undefined) return null;

  try {
    let numberValue: bigint;
    if (typeof value === 'bigint') {
      numberValue = value;
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
      numberValue = BigInt(value);
    } else {
      const trimmed = String(value).trim();
      if (!/^\d+$/.test(trimmed)) return null;
      numberValue = BigInt(trimmed);
    }

    return numberValue >= 0n ? numberValue : null;
  } catch {
    return null;
  }
}

/**
 * Parse a timestamp expressed in milliseconds (as number, Date, ISO-8601
 * string, or millisecond numeric string) into a ms-epoch, or null on any
 * ambiguous/invalid input. Chain block timestamps in seconds must use
 * `parseBlockTimestampMs`.
 */
export function parseTimestampMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) && ms >= 0 ? ms : null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{13}$/.test(trimmed)) {
      const ms = Number(trimmed);
      return Number.isFinite(ms) && ms >= 0 ? ms : null;
    }
    const ms = Date.parse(trimmed);
    return Number.isFinite(ms) && ms >= 0 ? ms : null;
  }

  return null;
}

/**
 * Parse a chain block-header timestamp expressed in SECONDS (number or
 * numeric string) into a ms-epoch, or null on invalid/ambiguous input.
 */
export function parseBlockTimestampMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value !== 'number' && typeof value !== 'string') return null;

  const num =
    typeof value === 'string' ? (value.trim() ? Number(value.trim()) : NaN) : value;

  if (!Number.isFinite(num) || num < 0) return null;

  const ms = Math.floor(num * 1000);
  return ms >= 0 ? ms : null;
}

/**
 * Derive an absolute deadline (ms-epoch) from canonical chain data: an
 * anchor block header (block number + timestamp) and a target block number,
 * assuming the protocol's expected block interval. Fails closed (deadlineMs
 * null) when any required input is missing or invalid. A target at or before
 * the anchor resolves to the anchor timestamp (blockDelta 0), which the
 * expiry check will evaluate as already meeting the deadline.
 */
export function deriveDeadlineFromBlocks(
  anchor: ChainClockAnchor,
  targetBlockNumber: bigint | number | string | null | undefined
): BlockDeadlineProjection {
  const anchorBlockNumber = normalizeBlockNumber(anchor?.anchorBlockNumber);
  const projectBlockNumber = normalizeBlockNumber(targetBlockNumber);
  const anchorTimestampMs = parseTimestampMs(anchor?.anchorBlockTimestampMs);

  if (anchorBlockNumber === null || projectBlockNumber === null) {
    return {
      deadlineMs: null,
      blockDelta: null,
      projectBlockNumber,
      anchorBlockNumber,
      avgBlockSeconds: null,
    };
  }

  if (anchorTimestampMs === null) {
    return {
      deadlineMs: null,
      blockDelta: null,
      projectBlockNumber,
      anchorBlockNumber,
      avgBlockSeconds: null,
    };
  }

  const avgBlockSeconds = Number(anchor?.avgBlockSeconds);
  if (!Number.isFinite(avgBlockSeconds) || avgBlockSeconds <= 0) {
    return {
      deadlineMs: null,
      blockDelta: null,
      projectBlockNumber,
      anchorBlockNumber,
      avgBlockSeconds: null,
    };
  }

  const blockDelta =
    projectBlockNumber >= anchorBlockNumber
      ? projectBlockNumber - anchorBlockNumber
      : 0n;

  const driftMs = Number(blockDelta) * avgBlockSeconds * 1000;
  const deadlineMs = anchorTimestampMs + driftMs;

  return {
    deadlineMs: Number.isFinite(deadlineMs) && deadlineMs >= 0 ? deadlineMs : null,
    blockDelta: Number.isFinite(driftMs) ? Number(blockDelta) : null,
    projectBlockNumber,
    anchorBlockNumber,
    avgBlockSeconds,
  };
}

/**
 * Determine whether a canonical deadline has been reached. Account for clock
 * skew so a client clock slightly ahead of chain time never prematurely
 * expires a live deadline. Returns null (fail closed) when the deadline is
 * unknown. Boundary: deadlineMs == nowMs is treated as expired.
 */
export function isDeadlineExpired(input: {
  deadlineMs: number | null | undefined;
  nowMs: number;
  clockSkewMs?: number;
}): boolean | null {
  const { deadlineMs, nowMs, clockSkewMs = 0 } = input;

  if (typeof deadlineMs !== 'number' || !Number.isFinite(deadlineMs)) return null;
  if (!Number.isFinite(nowMs)) return null;

  const skew = Number(clockSkewMs);
  const toleratedSkew = Number.isFinite(skew) && skew > 0 ? skew : 0;

  return deadlineMs - nowMs <= toleratedSkew + EPSILON;
}

/**
 * Determine whether a canonical deadline is within a future horizon window
 * (e.g. "expires soon"), without ever signalling a past deadline. Returns
 * null (fail closed) when the deadline is unknown.
 */
export function isDeadlineWithinHorizon(input: {
  deadlineMs: number | null | undefined;
  nowMs: number;
  horizonMs: number;
  clockSkewMs?: number;
}): boolean | null {
  const { deadlineMs, nowMs, horizonMs, clockSkewMs = 0 } = input;

  if (!Number.isFinite(horizonMs) || horizonMs < 0) return null;
  if (!Number.isFinite(nowMs)) return null;

  const expired = isDeadlineExpired({ deadlineMs, nowMs, clockSkewMs });
  if (expired === true) return false;
  if (expired === null) return null;

  return deadlineMs! - nowMs <= horizonMs + EPSILON;
}

/**
 * Canonical lifecycle state for a deadline. A confirmed canonical status that
 * signals expiry always wins over clock math; otherwise the state is derived
 * from the canonical deadline with clock-skew tolerance. Unknown deadlines
 * resolve to UNKNOWN (fail closed) — never guessed.
 */
export function resolveDeadlineState(input: {
  deadlineMs: number | null | undefined;
  nowMs: number;
  clockSkewMs?: number;
  /** Confirmed canonical status that authoritatively signals expiry. */
  canonicallyExpired?: boolean;
}): DeadlineState {
  if (input.canonicallyExpired === true) return 'EXPIRED';

  const expired = isDeadlineExpired({
    deadlineMs: input.deadlineMs,
    nowMs: input.nowMs,
    clockSkewMs: input.clockSkewMs,
  });

  if (expired === null) return 'UNKNOWN';
  return expired ? 'EXPIRED' : 'ACTIVE';
}

/**
 * Compact human context for a canonical deadline: user-local time plus the
 * absolute UTC value and, when available, the block projection. Returns null
 * when the deadline is unknown (fail closed).
 */
export function formatDeadlineContext(projection: {
  deadlineMs: number | null | undefined;
  blockContext?: string | null | undefined;
  includeSeconds?: boolean;
}): string | null {
  const { deadlineMs, blockContext, includeSeconds = true } = projection;
  if (typeof deadlineMs !== 'number' || !Number.isFinite(deadlineMs)) return null;

  const local = formatLocalDateTime(deadlineMs, { includeSeconds });
  const utc = formatUtcDateTime(deadlineMs, { includeSeconds });

  if (local === '—' || utc === '—') return null;

  return blockContext
    ? `${local} (${utc} · ${blockContext})`
    : `${local} (${utc})`;
}

/**
 * Block context label for a projected deadline, e.g.
 * "by block 1010 (+10)" or null when the projection is unavailable.
 */
export function formatBlockContext(projection: BlockDeadlineProjection): string | null {
  if (projection.projectBlockNumber === null) return null;

  const block = projection.projectBlockNumber.toString();
  const offset =
    projection.blockDelta !== null && projection.blockDelta > 0
      ? ` (+${projection.blockDelta})`
      : '';

  return `by block ${block}${offset}`;
}