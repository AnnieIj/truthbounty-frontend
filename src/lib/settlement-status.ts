/**
 * Settlement & payout status derivation (V2-FE-117).
 *
 * Pure, deterministic mapping from canonical settlement state + transaction
 * finality into an accessible view-model. Enforces the invariants in
 * `docs/ux/TRANSACTION_STATE_MODEL.md`:
 *   - a timer never produces success;
 *   - `confirmed` is distinguished from `finalized`;
 *   - a reorged receipt removes any success;
 *   - stale critical data fails closed (no durable success).
 *
 * Payout text is only produced from a real, caller-supplied amount; this module
 * never fabricates a payout, hash or confirmation.
 */

import { formatUnits } from 'viem';

import type { SettlementState } from '@/app/types/settlement';
import type { StatusToneName } from '@/lib/design-tokens';

export type SettlementFinality = 'none' | 'pending' | 'confirmed' | 'finalized' | 'reorged';

export type SettlementPhase =
  | 'loading'
  | 'empty'
  | 'awaiting'
  | 'submitting'
  | 'confirmed'
  | 'finalized'
  | 'paid'
  | 'reorged'
  | 'stale';

export interface SettlementStatusInput {
  /** Canonical settlement lifecycle state from the contract/indexer projection. */
  state?: SettlementState | null;
  /** Finality of the settlement transaction, when one was observed. */
  finality?: SettlementFinality;
  /** Real transaction hash from the wallet/provider (never fabricated). */
  txHash?: `0x${string}` | null;
  /** Chain id the transaction belongs to. */
  chainId?: number;
  /** Payout amount in wei, from the canonical receipt/projection. */
  payoutWei?: bigint | null;
  /** Token decimals for the payout. Defaults to 18. */
  decimals?: number;
  /** Payout token symbol. */
  symbol?: string;
  /** Projection is older than the freshness policy. */
  isStale?: boolean;
  /** Data is still loading. */
  isLoading?: boolean;
}

export interface SettlementStatusViewModel {
  phase: SettlementPhase;
  tone: StatusToneName;
  label: string;
  headline: string;
  description?: string;
  /** Durable success may be presented. Never true on a timer or when stale. */
  showSuccess: boolean;
  /** Formatted payout — present only when a real amount was supplied. */
  payoutText?: string;
  symbol?: string;
  txHash?: `0x${string}` | null;
  chainId?: number;
  /** A real hash exists, so an explorer link may be rendered. */
  explorerLinkable: boolean;
}

interface PhaseSpec {
  phase: SettlementPhase;
  tone: StatusToneName;
  label: string;
  headline: string;
  description?: string;
  /** Whether this canonical state is eligible for durable success. */
  success: boolean;
  showsPayout: boolean;
}

const STATE_MAP: Record<SettlementState, PhaseSpec> = {
  PENDING_SETTLEMENT: {
    phase: 'awaiting',
    tone: 'pending',
    label: 'Awaiting settlement',
    headline: 'Voting has ended. Settlement can be submitted by anyone.',
    success: false,
    showsPayout: false,
  },
  PENDING_APPEAL: {
    phase: 'awaiting',
    tone: 'pending',
    label: 'Appeal pending',
    headline: 'An appeal is open. Settlement is not final until it resolves.',
    success: false,
    showsPayout: false,
  },
  SETTLED: {
    phase: 'finalized',
    tone: 'finalized',
    label: 'Settled',
    headline: 'Provisional settlement recorded on-chain.',
    description: 'Payout can be claimed once finality is satisfied.',
    success: true,
    showsPayout: true,
  },
  APPEAL_SETTLED: {
    phase: 'finalized',
    tone: 'finalized',
    label: 'Appeal settled',
    headline: 'Appeal settlement recorded on-chain.',
    success: true,
    showsPayout: true,
  },
  SETTLEMENT_CLAIMED: {
    phase: 'paid',
    tone: 'success',
    label: 'Paid',
    headline: 'Settlement finalized and payout distributed.',
    success: true,
    showsPayout: true,
  },
  APPEAL_CLAIMED: {
    phase: 'paid',
    tone: 'success',
    label: 'Paid',
    headline: 'Appeal payout distributed.',
    success: true,
    showsPayout: true,
  },
  FINALIZED: {
    phase: 'finalized',
    tone: 'finalized',
    label: 'Finalized',
    headline: 'Settlement is final and can no longer be reorganised.',
    success: true,
    showsPayout: true,
  },
};

/**
 * Derive the accessible settlement/payout view-model from canonical inputs.
 */
export function deriveSettlementStatus(
  input: SettlementStatusInput = {},
): SettlementStatusViewModel {
  const {
    state = null,
    finality = 'none',
    txHash = null,
    chainId,
    payoutWei = null,
    decimals = 18,
    symbol,
    isStale = false,
    isLoading = false,
  } = input;

  const explorerLinkable = Boolean(txHash);

  if (isLoading) {
    return {
      phase: 'loading',
      tone: 'neutral',
      label: 'Loading',
      headline: 'Loading settlement status…',
      showSuccess: false,
      explorerLinkable: false,
      txHash: null,
      chainId,
      symbol,
    };
  }

  // A reorged receipt removes any previously shown success.
  if (finality === 'reorged') {
    return {
      phase: 'reorged',
      tone: 'orphaned',
      label: 'Reorged',
      headline: 'Settlement was reorganised and is no longer valid.',
      description:
        'The previously observed receipt was orphaned. Waiting for the canonical outcome.',
      showSuccess: false,
      explorerLinkable,
      txHash,
      chainId,
      symbol,
    };
  }

  // Stale critical data fails closed: never present durable success.
  if (isStale) {
    return {
      phase: 'stale',
      tone: 'warning',
      label: 'Stale data',
      headline: 'Settlement data may be out of date.',
      description:
        'Refresh to confirm the current on-chain state before relying on this result.',
      showSuccess: false,
      explorerLinkable,
      txHash,
      chainId,
      symbol,
    };
  }

  if (!state) {
    return {
      phase: 'empty',
      tone: 'neutral',
      label: 'No settlement',
      headline: 'No settlement has been recorded for this claim yet.',
      showSuccess: false,
      explorerLinkable,
      txHash,
      chainId,
      symbol,
    };
  }

  const spec = STATE_MAP[state];
  if (!spec) {
    return {
      phase: 'empty',
      tone: 'neutral',
      label: 'Unknown state',
      headline: 'Settlement state is not recognised.',
      showSuccess: false,
      explorerLinkable,
      txHash,
      chainId,
      symbol,
    };
  }

  let phase = spec.phase;
  let tone = spec.tone;
  let label = spec.label;
  let headline = spec.headline;
  let description = spec.description;
  let showSuccess = false;

  if (spec.success) {
    // Durable success only when finality is satisfied, or when no transaction
    // was tracked and we rely on the canonical projection state.
    if (finality === 'finalized' || finality === 'none') {
      showSuccess = true;
    } else {
      phase = 'confirmed';
      tone = 'confirmed';
      label = 'Confirming';
      headline = 'Settlement confirmed, awaiting finality.';
      description = 'Not final yet — the outcome could still reorganise.';
      showSuccess = false;
    }
  } else if (finality === 'pending') {
    phase = 'submitting';
    tone = 'pending';
    label = 'Submitting';
    headline = 'Settlement transaction submitted — a hash is not confirmation.';
    description = 'Wait for the receipt before treating this as settled.';
  } else if (finality === 'confirmed') {
    phase = 'confirmed';
    tone = 'confirmed';
    label = 'Confirming';
    headline = 'Settlement transaction confirmed, awaiting finality.';
  }

  const payoutText =
    spec.showsPayout && payoutWei !== null
      ? formatUnits(payoutWei, decimals)
      : undefined;

  return {
    phase,
    tone,
    label,
    headline,
    description,
    showSuccess,
    payoutText,
    symbol,
    txHash,
    chainId,
    explorerLinkable,
  };
}
