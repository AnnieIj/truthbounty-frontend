/**
 * Reward Entitlement and Claim Flow types — V2-FE-060
 *
 * Domain model for reading finalized claimable balances, explaining
 * allocation categories, submitting pull claims, and reconciling
 * partial/multiple-asset receipts on Optimism (EVM).
 *
 * Security invariants:
 *  - Amounts are exact bigint wei values; never floats or client-derived sums
 *    of untrusted data.
 *  - Every raw record received over the network is untrusted input and must
 *    pass `validateRewardEntitlements` before it reaches UI state.
 *  - Lifecycle state is driven by canonical on-chain receipts/projections,
 *    never by timers or client guesses.
 *  - No fabricated hashes, receipts, calldata, gas, or rewards.
 */

import type { Address } from 'viem';

// ---------------------------------------------------------------------------
// Allocation categories
// ---------------------------------------------------------------------------

/**
 * Why a reward was allocated. Each category has a human-facing explanation
 * surfaced in the UI so users understand what they are being paid for.
 */
export const REWARD_ALLOCATION_CATEGORIES = [
  'verification_reward',
  'stake_return',
  'stake_winnings',
  'dispute_bond_refund',
  'appeal_reward',
] as const;

export type RewardAllocationCategory =
  (typeof REWARD_ALLOCATION_CATEGORIES)[number];

export const REWARD_ALLOCATION_EXPLANATIONS: Record<
  RewardAllocationCategory,
  string
> = {
  verification_reward:
    'Paid for casting a verification that matched the finalized outcome.',
  stake_return:
    'Your original stake, returned after the claim finalized in your favour.',
  stake_winnings:
    'Your proportional share of the losing side’s staked amount.',
  dispute_bond_refund:
    'Your dispute bond, refunded because your challenge was upheld.',
  appeal_reward:
    'Paid for supporting the correct side during the appeal round.',
};

export function isRewardAllocationCategory(
  value: unknown,
): value is RewardAllocationCategory {
  return (
    typeof value === 'string' &&
    (REWARD_ALLOCATION_CATEGORIES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Entitlements (untrusted until validated)
// ---------------------------------------------------------------------------

/** Raw entitlement shape as returned by the backend API (untrusted). */
export interface RawRewardEntitlement {
  claimId?: unknown;
  category?: unknown;
  amount?: unknown;
  asset?: unknown;
  decimals?: unknown;
  claimable?: unknown;
}

/**
 * A validated, canonical reward entitlement. Constructed only through
 * `validateRewardEntitlements` — never hand-built from API payloads.
 */
export interface RewardEntitlement {
  /** bytes32 claim id (`0x` + 64 hex chars). */
  readonly claimId: `0x${string}`;
  /** Why this reward exists (drives the UI explanation). */
  readonly category: RewardAllocationCategory;
  /** Exact amount in the asset's smallest unit (wei-like bigint). */
  readonly amount: bigint;
  /** ERC-20 asset contract address (zero address = native/protocol asset). */
  readonly asset: Address;
  /** Display decimals for the asset, validated range 0–36. */
  readonly decimals: number;
  /** Whether the backend projection marks this entitlement claimable. */
  readonly claimable: boolean;
}

/**
 * Grouped entitlements by asset, used to explain allocation categories and
 * to reconcile partial/multiple asset receipts.
 */
export interface RewardEntitlementSummary {
  /** Entitlements that are claimable, grouped per asset address. */
  readonly claimableByAsset: ReadonlyArray<{
    readonly asset: Address;
    readonly decimals: number;
    /** Exact total across entitlements for this asset. */
    readonly totalAmount: bigint;
    readonly categories: ReadonlySet<RewardAllocationCategory>;
  }>;
  /** All validated entitlements, claimable or not. */
  readonly entitlements: readonly RewardEntitlement[];
  /** True when at least one claimable entitlement exists. */
  readonly hasClaimable: boolean;
}

// ---------------------------------------------------------------------------
// Claim lifecycle
// ---------------------------------------------------------------------------

/**
 * Claim request submitted through the hook. The claim transaction itself is
 * encoded by wagmi/viem from the frozen release ABI — calldata is never
 * authored by hand.
 */
export interface RewardClaimRequest {
  /** bytes32 claim ids to pull, as validated by the entitlements query. */
  readonly claimIds: readonly `0x${string}`[];
  /** Optional gas override; when absent viem estimates gas itself. */
  readonly gas?: bigint;
}

/** States of the pull-claim lifecycle, driven by machine + receipts. */
export type RewardClaimStatus =
  | 'idle'
  | 'preparing'
  | 'signature-requested'
  | 'submitted'
  | 'confirming'
  | 'confirmed'
  | 'reverted'
  | 'rejected'
  | 'error';

// ---------------------------------------------------------------------------
// Receipt projection (canonical reconciliation output)
// ---------------------------------------------------------------------------

/** An ERC-20 Transfer log decoded from a confirmed receipt. */
export interface ClaimedAssetTransfer {
  readonly asset: Address;
  /** Exact amount transferred to the claimer in the asset's smallest unit. */
  readonly amount: bigint;
}

/**
 * Canonical result of reconciling a confirmed claim receipt against the
 * pre-claim entitlements. Produced only from a wagmi/viem receipt — the
 * source of truth for lifecycle state.
 */
export interface RewardClaimReceiptProjection {
  /** Confirmed transaction hash (never fabricated). */
  readonly transactionHash: `0x${string}`;
  readonly chainId: number;
  readonly blockNumber: bigint;
  /** Contract that emitted the receipt (validated against release address). */
  readonly contractAddress: Address;
  /**
   * Assets actually received, decoded from Transfer logs to the claimer.
   * May be partial relative to the requested entitlements (multiple assets,
   * partial payout) — consumers must render what arrived, not what was
   * requested.
   */
  readonly receivedAssets: readonly ClaimedAssetTransfer[];
  /** Entitlements (by claimId) fully settled by this receipt. */
  readonly settledClaimIds: readonly `0x${string}`[];
  /** Entitlements still outstanding after this receipt. */
  readonly outstandingClaimIds: readonly `0x${string}`[];
}

/** Failure result when a claim transaction does not confirm. */
export interface RewardClaimFailure {
  readonly status: 'reverted' | 'rejected' | 'error';
  /** Machine/wagmi error code or reason. Never invented. */
  readonly reason: string;
  /** Present for 'reverted' — the hash of the reverted transaction. */
  readonly transactionHash?: `0x${string}`;
}
