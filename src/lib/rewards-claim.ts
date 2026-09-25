/**
 * Rewards claim flow logic (V2-FE-118).
 *
 * Pure eligibility, aggregation and status-presentation helpers for the
 * rewards claim journey. These functions never fabricate an amount, hash or
 * outcome — they classify caller-supplied, canonical data and fail closed on
 * unsupported chains, missing wallets or empty projections.
 */

import { isSupportedChain } from '@/config/chains';
import type { StatusToneName } from '@/lib/design-tokens';

/** A claimable reward row as returned by the read/projection layer. */
export interface ClaimableRewardItem {
  id: string;
  /** Amount exactly as projected (string or number); never re-derived here. */
  amount: number | string;
  reason?: string;
}

/** Lifecycle states for the rewards claim journey. */
export type RewardsClaimStatus =
  | 'idle'
  | 'loading'
  | 'approvalRequired'
  | 'awaitingSignature'
  | 'submitted'
  | 'confirming'
  | 'confirmed'
  | 'finalized'
  | 'rejected'
  | 'reverted'
  | 'error';

export type ClaimBlockReason =
  | 'wallet-disconnected'
  | 'wrong-chain'
  | 'no-rewards'
  | 'in-progress'
  | null;

export interface ClaimEligibilityInput {
  address?: string | null;
  isConnected?: boolean;
  chainId?: number | null;
  /** Canonical release chain id from the contract registry. */
  expectedChainId: number;
  claimableCount: number;
  inProgress?: boolean;
}

export interface ClaimEligibility {
  canClaim: boolean;
  reason: ClaimBlockReason;
  /** Safe, user-facing explanation (also used as the disabled-button reason). */
  message: string | null;
}

/**
 * Determine whether a claim may be submitted, failing closed on any missing or
 * mismatched precondition. The returned `message` is safe to surface directly.
 */
export function computeClaimEligibility(
  input: ClaimEligibilityInput,
): ClaimEligibility {
  const {
    address,
    isConnected,
    chainId,
    expectedChainId,
    claimableCount,
    inProgress = false,
  } = input;

  if (!isConnected || !address) {
    return {
      canClaim: false,
      reason: 'wallet-disconnected',
      message: 'Connect your wallet to claim rewards.',
    };
  }

  if (
    chainId === null ||
    chainId === undefined ||
    !isSupportedChain(chainId) ||
    chainId !== expectedChainId
  ) {
    return {
      canClaim: false,
      reason: 'wrong-chain',
      message: `Switch to the correct network (chain ${expectedChainId}) to claim rewards.`,
    };
  }

  if (inProgress) {
    return {
      canClaim: false,
      reason: 'in-progress',
      message: 'A claim is already in progress.',
    };
  }

  if (claimableCount <= 0) {
    return {
      canClaim: false,
      reason: 'no-rewards',
      message: 'No claimable rewards yet.',
    };
  }

  return { canClaim: true, reason: null, message: null };
}

/**
 * Sum claimable amounts deterministically. Non-finite entries are ignored so a
 * malformed projection row can never inflate the displayed total.
 */
export function sumClaimable(rewards: ClaimableRewardItem[]): number {
  return rewards.reduce((sum, reward) => {
    const value = Number(reward?.amount ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

/** Map a claim status to an accessible badge tone + label. */
export function claimStatusBadge(status: RewardsClaimStatus): {
  tone: StatusToneName;
  label: string;
} {
  switch (status) {
    case 'loading':
      return { tone: 'neutral', label: 'Loading' };
    case 'approvalRequired':
      return { tone: 'warning', label: 'Approval required' };
    case 'awaitingSignature':
      return { tone: 'pending', label: 'Awaiting signature' };
    case 'submitted':
      return { tone: 'pending', label: 'Submitted' };
    case 'confirming':
      return { tone: 'confirmed', label: 'Confirming' };
    case 'confirmed':
      return { tone: 'confirmed', label: 'Confirmed' };
    case 'finalized':
      return { tone: 'success', label: 'Claimed' };
    case 'rejected':
      return { tone: 'warning', label: 'Rejected' };
    case 'reverted':
      return { tone: 'danger', label: 'Reverted' };
    case 'error':
      return { tone: 'danger', label: 'Failed' };
    case 'idle':
    default:
      return { tone: 'neutral', label: 'Ready' };
  }
}

/**
 * Classify a write-contract error into a safe status + message. Raw wallet/RPC
 * error text is never surfaced to users.
 */
export function classifyClaimError(error: unknown): {
  status: RewardsClaimStatus;
  message: string;
} {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : '';
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const haystack = `${name} ${raw}`.toLowerCase();

  if (haystack.includes('reject') || haystack.includes('denied')) {
    return { status: 'rejected', message: 'You rejected the transaction. You can try again.' };
  }
  if (haystack.includes('revert')) {
    return { status: 'reverted', message: 'The claim reverted on-chain. No rewards were transferred.' };
  }
  if (haystack.includes('allowance') || haystack.includes('approval')) {
    return { status: 'approvalRequired', message: 'Token approval is required before claiming.' };
  }
  return { status: 'error', message: 'The claim could not be submitted. Please try again.' };
}
