/**
 * Claim receipt reconciliation — V2-FE-060
 *
 * Reconciles confirmed claim transactions against pre-claim entitlements.
 *
 * Canonical authority: wagmi/viem receipts only. This module never invents
 * hashes, amounts, or settlement outcomes; every value is decoded from a
 * confirmed receipt or matched against validated entitlements.
 */

import { getAddress, isAddress, type Address } from 'viem';

import {
  REWARD_ALLOCATION_EXPLANATIONS,
  type ClaimedAssetTransfer,
  type RewardAllocationCategory,
  type RewardClaimReceiptProjection,
  type RewardEntitlement,
} from '@/app/types/rewards';

/** Receipt shape subset we rely on (viem-compatible, structurally typed). */
export interface ClaimReceiptLike {
  readonly transactionHash: `0x${string}`;
  readonly status: 'success' | 'reverted' | (string & {});
  readonly blockNumber: bigint;
  readonly chainId?: number;
  /** Recipient contract of the transaction, when present on the receipt. */
  readonly to?: string;
  readonly logs?: ReadonlyArray<{
    readonly address?: string;
    readonly topics?: readonly `0x${string}`[];
    readonly data?: `0x${string}`;
  }>;
}

/** Pre-claim entitlement snapshot used to classify receipts. */
export interface ClaimReconciliationInput {
  readonly receipt: ClaimReceiptLike;
  /** Contract address the claim was submitted to (release registry value). */
  readonly contractAddress: Address;
  /** Chain the claim was submitted on (release chain id). */
  readonly expectedChainId: number;
  /** Canonical ERC-20 Transfer topic0: keccak256("Transfer(address,address,uint256)"). */
  readonly transferTopic: `0x${string}`;
  /** Entitlements requested in the claim (pre-claim snapshot). */
  readonly requestedEntitlements: readonly RewardEntitlement[];
  /** The claimer's address — Transfer logs directed here count as received. */
  readonly recipient: Address;
}

/**
 * ERC-20 Transfer topic. Pinned constant so log decoding does not depend on
 * runtime hashing of arbitrary input.
 */
export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const;

/** Extract the claimer address from a Transfer topic (indexed address). */
function topicToAddress(topic: `0x${string}`): Address | null {
  if (!/^0x[a-fA-F0-9]{64}$/.test(topic)) return null;
  const raw = `0x${topic.slice(26)}`;
  try {
    return getAddress(raw);
  } catch {
    return null;
  }
}

/** Decode a uint256 amount from log data (single 32-byte word). */
function decodeAmountWord(data: `0x${string}`): bigint | null {
  if (!/^0x([a-fA-F0-9]{64})$/.test(data)) return null;
  try {
    return BigInt(data);
  } catch {
    return null;
  }
}

/**
 * Decode ERC-20 `Transfer(address indexed from, address indexed to,
 * uint256 value)` logs directed at `recipient` from a receipt. Only logs
 * emitted by validated token addresses with the canonical Transfer topic
 * are considered.
 */
export function extractClaimedTransfers(
  receipt: ClaimReceiptLike,
  recipient: Address,
): ClaimedAssetTransfer[] {
  const transfers: ClaimedAssetTransfer[] = [];
  const recipientLower = recipient.toLowerCase();

  for (const log of receipt.logs ?? []) {
    const topics = log.topics ?? [];
    if (topics.length < 3) continue;
    if (topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;
    if (!log.address || typeof log.address !== 'string') continue;

    let token: Address;
    try {
      token = getAddress(log.address);
    } catch {
      continue;
    }

    const to = topicToAddress(topics[2] as `0x${string}`);
    if (!to || to.toLowerCase() !== recipientLower) continue;

    const amount = decodeAmountWord(log.data ?? '0x');
    if (amount === null) continue;

    transfers.push({ asset: token, amount });
  }

  // Aggregate duplicate transfers per asset (multiple payouts in one tx).
  const aggregated = new Map<Address, bigint>();
  for (const transfer of transfers) {
    aggregated.set(
      transfer.asset,
      (aggregated.get(transfer.asset) ?? 0n) + transfer.amount,
    );
  }
  return Array.from(aggregated.entries())
    .map(([asset, amount]) => ({ asset, amount }))
    .sort((a, b) => (a.asset.toLowerCase() < b.asset.toLowerCase() ? -1 : 1));
}

/**
 * Classify entitlements as settled or outstanding given the assets actually
 * received. When several entitlements share an asset, a partial transfer
 * cannot prove which claim id settled, so the whole asset group remains
 * outstanding unless its aggregate amount was received.
 */
function partitionByReceipt(
  requestedEntitlements: readonly RewardEntitlement[],
  receivedAssets: readonly ClaimedAssetTransfer[],
): {
  settledClaimIds: `0x${string}`[];
  outstandingClaimIds: `0x${string}`[];
} {
  const receivedByAsset = new Map<Address, bigint>();
  for (const transfer of receivedAssets) {
    receivedByAsset.set(
      transfer.asset,
      (receivedByAsset.get(transfer.asset) ?? 0n) + transfer.amount,
    );
  }

  const entitlementsByAsset = new Map<Address, RewardEntitlement[]>();
  for (const entitlement of requestedEntitlements) {
    const group = entitlementsByAsset.get(entitlement.asset) ?? [];
    group.push(entitlement);
    entitlementsByAsset.set(entitlement.asset, group);
  }

  const settledClaimIds: `0x${string}`[] = [];
  const outstandingClaimIds: `0x${string}`[] = [];
  for (const [asset, entitlements] of entitlementsByAsset) {
    const expected = entitlements.reduce((total, item) => total + item.amount, 0n);
    const received = receivedByAsset.get(asset) ?? 0n;
    const target = received >= expected ? settledClaimIds : outstandingClaimIds;
    target.push(...entitlements.map((item) => item.claimId));
  }

  return { settledClaimIds, outstandingClaimIds };
}

export type ReconcileClaimOutcome =
  | {
      readonly status: 'confirmed';
      readonly projection: RewardClaimReceiptProjection;
    }
  | {
      readonly status: 'reverted';
      readonly reason: string;
      readonly transactionHash: `0x${string}`;
    }
  | {
      readonly status: 'invalid';
      readonly reason: string;
    };

/**
 * Reconcile a receipt into a canonical projection. Fails closed on reverted
 * receipts, chain/contract mismatch, or malformed receipts — callers must
 * never treat unverified outcomes as settled.
 */
export function reconcileClaimReceipt(
  input: ClaimReconciliationInput,
): ReconcileClaimOutcome {
  const {
    receipt,
    contractAddress,
    expectedChainId,
    requestedEntitlements,
    recipient,
  } = input;

  if (receipt.status !== 'success') {
    return {
      status: 'reverted',
      reason:
        receipt.status === 'reverted'
          ? 'Claim transaction reverted on-chain.'
          : `Claim transaction has unconfirmed receipt status "${String(receipt.status)}".`,
      transactionHash: receipt.transactionHash,
    };
  }

  if (typeof receipt.chainId === 'number' && receipt.chainId !== expectedChainId) {
    return {
      status: 'invalid',
      reason: `Receipt chain ${receipt.chainId} does not match expected chain ${expectedChainId}.`,
    };
  }

  if (receipt.blockNumber === undefined || receipt.blockNumber === null) {
    return {
      status: 'invalid',
      reason: 'Receipt is missing a block number; cannot confirm finality.',
    };
  }

  const receiptContract =
    typeof receipt.to === 'string' && isAddress(receipt.to)
      ? getAddress(receipt.to)
      : null;
  if (
    !receiptContract ||
    receiptContract.toLowerCase() !== contractAddress.toLowerCase()
  ) {
    return {
      status: 'invalid',
      reason: 'Receipt was not emitted by the canonical claim contract.',
    };
  }

  // The claimer is the connected account; contractAddress here is the claim
  // contract, so the recipient of Transfers is passed in separately.
  const receivedAssets = extractClaimedTransfers(receipt, recipient);

  return {
    status: 'confirmed',
    projection: {
      transactionHash: receipt.transactionHash,
      chainId:
        typeof receipt.chainId === 'number' ? receipt.chainId : expectedChainId,
      blockNumber: receipt.blockNumber,
      contractAddress,
      receivedAssets,
      ...partitionByReceipt(requestedEntitlements, receivedAssets),
    },
  };
}

/**
 * Human-facing explanation for each allocation category present in an
 * entitlement set (used by the UI to explain why rewards exist).
 */
export function explainAllocationCategories(
  categories: Iterable<RewardAllocationCategory>,
): Array<{ category: RewardAllocationCategory; explanation: string }> {
  return Array.from(categories).map((category) => ({
    category,
    explanation: REWARD_ALLOCATION_EXPLANATIONS[category],
  }));
}
