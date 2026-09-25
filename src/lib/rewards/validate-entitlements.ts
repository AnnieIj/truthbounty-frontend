/**
 * Entitlement validation — V2-FE-060
 *
 * All API, wallet, RPC, and evidence content is untrusted input. These pure
 * guards convert raw payloads into canonical `RewardEntitlement` values or
 * fail closed. Nothing here performs network I/O or touches wallets.
 */

import { getAddress, isAddress, type Address } from 'viem';

import {
  isRewardAllocationCategory,
  type RawRewardEntitlement,
  type RewardAllocationCategory,
  type RewardEntitlement,
  type RewardEntitlementSummary,
} from '@/app/types/rewards';

/** bytes32: 0x + 64 hex chars. */
const BYTES32_PATTERN = /^0x[a-fA-F0-9]{64}$/;

export function isBytes32Hex(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && BYTES32_PATTERN.test(value);
}

const MIN_DISPLAY_DECIMALS = 0;
const MAX_DISPLAY_DECIMALS = 36;

/** Amounts must be canonical non-negative decimal integer strings or bigint. */
function parseAmount(raw: unknown): bigint | null {
  if (typeof raw === 'bigint') {
    return raw >= 0n ? raw : null;
  }
  if (typeof raw === 'string') {
    // Reject anything that is not a pure decimal integer (no floats, no
    // scientific notation, no whitespace, no signs).
    if (!/^\d+$/.test(raw)) return null;
    // Guard against absurd lengths that could DoS bigint parsing.
    if (raw.length > 78) return null;
    try {
      return BigInt(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/** Validate a single raw entitlement; returns null when it fails closed. */
export function validateRewardEntitlement(
  raw: unknown,
): RewardEntitlement | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as RawRewardEntitlement;

  if (!isBytes32Hex(candidate.claimId)) return null;
  if (!isRewardAllocationCategory(candidate.category)) return null;

  const amount = parseAmount(candidate.amount);
  if (amount === null) return null;

  // Asset must be a well-formed address. The zero address denotes the
  // protocol's native/asset-less payout and is allowed here; operational
  // contract addresses are validated against the release registry.
  if (typeof candidate.asset !== 'string' || !isAddress(candidate.asset)) {
    return null;
  }
  const asset = getAddress(candidate.asset);

  if (
    typeof candidate.decimals !== 'number' ||
    !Number.isInteger(candidate.decimals) ||
    candidate.decimals < MIN_DISPLAY_DECIMALS ||
    candidate.decimals > MAX_DISPLAY_DECIMALS
  ) {
    return null;
  }

  if (typeof candidate.claimable !== 'boolean') return null;

  return {
    claimId: candidate.claimId,
    category: candidate.category,
    amount,
    asset,
    decimals: candidate.decimals,
    claimable: candidate.claimable,
  };
}

/**
 * Validate an untrusted entitlement list into canonical form. Invalid entries
 * fail closed: they are dropped and reported, never coerced into plausible
 * values.
 */
export function validateRewardEntitlements(
  payload: unknown,
): {
  entitlements: RewardEntitlement[];
  rejectedCount: number;
  rejectionReasons: string[];
} {
  if (!Array.isArray(payload)) {
    return {
      entitlements: [],
      rejectedCount: 1,
      rejectionReasons: ['Entitlement payload is not an array'],
    };
  }

  const entitlements: RewardEntitlement[] = [];
  const rejectionReasons: string[] = [];
  const seenClaimIds = new Set<string>();
  const decimalsByAsset = new Map<Address, number>();

  payload.forEach((entry, index) => {
    const validated = validateRewardEntitlement(entry);
    if (!validated) {
      rejectionReasons.push(`Invalid entitlement (index ${index})`);
      return;
    }

    const claimId = validated.claimId.toLowerCase();
    if (seenClaimIds.has(claimId)) {
      rejectionReasons.push(`Duplicate entitlement claim id (index ${index})`);
      return;
    }

    const existingDecimals = decimalsByAsset.get(validated.asset);
    if (
      existingDecimals !== undefined &&
      existingDecimals !== validated.decimals
    ) {
      rejectionReasons.push(`Inconsistent asset decimals (index ${index})`);
      return;
    }

    seenClaimIds.add(claimId);
    decimalsByAsset.set(validated.asset, validated.decimals);
    entitlements.push(validated);
  });

  return {
    entitlements,
    rejectedCount: rejectionReasons.length,
    rejectionReasons,
  };
}

/**
 * Group validated entitlements per asset and explain allocation categories.
 * Totals are exact bigint sums over canonical amounts only.
 */
export function summarizeRewardEntitlements(
  entitlements: readonly RewardEntitlement[],
): RewardEntitlementSummary {
  const byAsset = new Map<
    Address,
    { amount: bigint; decimals: number; categories: Set<RewardAllocationCategory> }
  >();

  for (const entitlement of entitlements) {
    if (!entitlement.claimable) continue;
    const existing = byAsset.get(entitlement.asset);
    if (existing) {
      existing.amount += entitlement.amount;
      existing.categories.add(entitlement.category);
    } else {
      byAsset.set(entitlement.asset, {
        amount: entitlement.amount,
        decimals: entitlement.decimals,
        categories: new Set<RewardAllocationCategory>([entitlement.category]),
      });
    }
  }

  const claimableByAsset = Array.from(byAsset.entries())
    .map(([asset, agg]) => ({
      asset,
      decimals: agg.decimals,
      totalAmount: agg.amount,
      categories: agg.categories,
    }))
    // Deterministic ordering for stable rendering.
    .sort((a, b) => (a.asset.toLowerCase() < b.asset.toLowerCase() ? -1 : 1));

  return {
    claimableByAsset,
    entitlements,
    hasClaimable: claimableByAsset.length > 0,
  };
}
