/**
 * Economic disclosure helpers (V2-FE-116).
 *
 * Pure, deterministic derivations of bond / allowance / fee / risk values from
 * CANONICAL protocol parameters (`release/parameters`) and caller-supplied
 * on-chain inputs. Nothing here fabricates an amount: every figure originates
 * from the release registry or from a real wallet/allowance read passed in by
 * the caller. When canonical parameters are missing or malformed the reader
 * fails closed (returns `null`) so the UI never presents invented economics.
 */

import { formatUnits } from 'viem';

import { getProtocolRelease } from '@/lib/contracts/registry';

export interface CanonicalEconomicParameters {
  chainId: number;
  /** Minimum bond, in wei (canonical `minBondAmount`). */
  minBondWei: bigint;
  /** Protocol fee in basis points (100 bps = 1%). */
  protocolFeeBps: number;
  /** Appeal window length in seconds. */
  appealWindowSeconds: number;
}

/**
 * Read and validate the canonical economic parameter set.
 * Returns `null` (fail closed) when parameters are absent or malformed.
 */
export function getCanonicalEconomicParameters(): CanonicalEconomicParameters | null {
  try {
    const params = getProtocolRelease().parameters as Record<string, unknown>;

    const chainId = Number(params.chainId);
    const minBondWei = BigInt(String(params.minBondAmount));
    const protocolFeeBps = Number(params.protocolFeeBps);
    const appealWindowSeconds = Number(params.appealWindowSeconds);

    if (!Number.isInteger(chainId) || chainId <= 0) return null;
    if (minBondWei < 0n) return null;
    if (!Number.isInteger(protocolFeeBps) || protocolFeeBps < 0) return null;
    if (!Number.isInteger(appealWindowSeconds) || appealWindowSeconds < 0) return null;

    return { chainId, minBondWei, protocolFeeBps, appealWindowSeconds };
  } catch {
    return null;
  }
}

/** Format a wei amount to a human string using fixed decimals. Never rounds. */
export function formatTokenAmount(wei: bigint, decimals = 18): string {
  return formatUnits(wei, decimals);
}

/** Convert basis points to a trimmed percentage string (100 bps -> "1%"). */
export function bpsToPercent(bps: number): string {
  const percent = bps / 100;
  const decimals = Number.isInteger(percent) ? 0 : 2;
  return `${percent.toFixed(decimals)}%`;
}

/** Deterministic, locale-stable duration string for a number of seconds. */
export function formatDurationSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return 'Unknown';
  if (totalSeconds === 0) return '0 seconds';

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (seconds && parts.length === 0) {
    parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  }

  return parts.join(', ');
}

export type AllowanceStatus = 'sufficient' | 'insufficient' | 'unknown';

/**
 * Compare an on-chain ERC-20 allowance against the amount an action requires.
 * `null`/`undefined` allowance is reported as `unknown` (fail closed) rather
 * than assumed sufficient.
 */
export function getAllowanceStatus(
  current: bigint | null | undefined,
  required: bigint,
): AllowanceStatus {
  if (current === null || current === undefined) return 'unknown';
  return current >= required ? 'sufficient' : 'insufficient';
}

export type BondAffordability = 'affordable' | 'insufficient' | 'unknown';

/** Compare a spendable balance against a required bond, failing closed. */
export function getBondAffordability(
  balance: bigint | null | undefined,
  bond: bigint,
): BondAffordability {
  if (balance === null || balance === undefined) return 'unknown';
  return balance >= bond ? 'affordable' : 'insufficient';
}
