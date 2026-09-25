/**
 * Stake & Treasury Withdrawal types (V2-FE-061).
 *
 * UI state model for the stake balance view and the recipient-batched treasury
 * withdrawal journey. Canonical reads (`balanceOf`, `treasuryBalance`) and
 * confirmed Optimism/EVM receipts remain authoritative: the UI never fabricates
 * balances, calldata, gas, transaction hashes, confirmations, or success.
 */

/** Assets this UX can withdraw. Only the canonical native asset is supported. */
export type StakeTreasuryAsset = 'native';

/** Top-level, accessible UI state for the stake/treasury panel. */
export type StakeTreasuryUiStatus =
  | 'loading'
  | 'empty'
  | 'ready'
  | 'stale'
  | 'unauthorized'
  | 'unsupported_chain'
  | 'missing_config'
  | 'submitting'
  | 'rejected'
  | 'pending'
  | 'failed'
  | 'confirmed'
  | 'finalized'
  | 'partial';

/**
 * Reserved = the connected account's canonical staked balance (`balanceOf`).
 * Unlocked = the canonical withdrawable treasury balance (`treasuryBalance`).
 * Both are read from chain; a failed read yields `null` for that field and the
 * UI fails closed rather than inventing a number.
 */
export interface StakeTreasuryBalanceView {
  /** Reserved stake (`balanceOf(account)`), wei string, or null if unread. */
  reservedWei: string | null;
  /** Unlocked treasury (`treasuryBalance()`), wei string, or null if unread. */
  unlockedWei: string | null;
  /** Canonical minimum bond parameter (wei) when published, else null. */
  minBondWei: string | null;
  /** ISO timestamp of the successful read (or attempt). */
  fetchedAt: string;
  /** True when the snapshot age exceeds the staleness threshold. */
  isStale: boolean;
  chainId: number;
  contractAddress: `0x${string}`;
}

/** One recipient row in a batched withdrawal. */
export interface StakeTreasuryRecipientRow {
  id: string;
  recipient: string;
  amountWei: string;
  asset: StakeTreasuryAsset;
}

/** Per-recipient lifecycle; isolated so one failure never masks another. */
export type RecipientOutcomeStatus =
  | 'idle'
  | 'invalid'
  | 'awaiting_signature'
  | 'submitted'
  | 'confirmed'
  | 'finalized'
  | 'rejected'
  | 'failed';

export interface RecipientOutcome {
  id: string;
  recipient: string;
  amountWei: string;
  status: RecipientOutcomeStatus;
  /** Real hash from the wallet/provider only; null until then. */
  txHash: `0x${string}` | null;
  chainId: number | null;
  confirmations: number | null;
  error?: string;
  submittedAt?: string;
  finalizedAt?: string;
}

export interface StakeTreasuryValidation {
  ok: boolean;
  errors: string[];
  /** Row id -> messages, so the UI can annotate the exact recipient row. */
  rowErrors: Record<string, string[]>;
  warnings: string[];
}

/** Fail-closed gate for the withdrawal write path. */
export interface StakeTreasuryGate {
  walletConnected: boolean;
  chainSupported: boolean;
  configComplete: boolean;
  abiSupportsWithdraw: boolean;
  isAdmin: boolean;
  blockReason: string | null;
}

export interface StakeTreasurySummary {
  total: number;
  confirmed: number;
  failed: number;
  rejected: number;
  /** In-flight rows that are neither terminal nor rejected. */
  pending: number;
  /** True when every outcome reached a terminal state. */
  allSettled: boolean;
  /** True when at least one outcome is still indeterminate. */
  anyIndeterminate: boolean;
  /** True when at least one succeeded and at least one failed/rejected. */
  partial: boolean;
}

export const STAKE_TREASURY_STALE_MS = 60_000;
export const SUPPORTED_WITHDRAWAL_ASSETS: readonly StakeTreasuryAsset[] = ['native'];
export const NATIVE_ASSET_LABEL = 'Native ETH (Optimism)';
