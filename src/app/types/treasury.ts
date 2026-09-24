/**
 * Safe Treasury Withdrawal types (V2-FE-119)
 *
 * UI state model for admin-gated protocol treasury withdrawals.
 * Contracts remain authoritative; the frontend never fabricates
 * balances, tx hashes, confirmations, or withdrawal outcomes.
 */

import type { OptimismChainId } from '@/lib/transaction-machine/transaction-machine.types';

/** User-visible withdrawal lifecycle (accessible + recoverable). */
export type TreasuryWithdrawalUiStatus =
  | 'loading'
  | 'empty'
  | 'ready'
  | 'stale'
  | 'unauthorized'
  | 'unsupported_chain'
  | 'missing_config'
  | 'review'
  | 'confirming'
  | 'simulating'
  | 'awaiting_signature'
  | 'rejected'
  | 'pending'
  | 'failed'
  | 'confirmed'
  | 'finalized'
  | 'reorged';

export type TreasuryWithdrawalStep =
  | 'form'
  | 'review'
  | 'typed_confirm'
  | 'submit';

export interface TreasuryBalanceSnapshot {
  /** Wei string from canonical contract read; never invented. */
  amountWei: string;
  /** ISO timestamp of the successful read. */
  fetchedAt: string;
  /** True when snapshot age exceeds staleness threshold. */
  isStale: boolean;
  chainId: OptimismChainId | number;
  contractAddress: `0x${string}`;
}

export interface TreasuryWithdrawalDraft {
  recipient: string;
  amountWei: string;
  /** Optional human note; never sent on-chain. */
  reason?: string;
}

export interface TreasuryWithdrawalValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface TreasuryWithdrawalSimulation {
  success: boolean;
  gasEstimate?: string;
  calldata?: `0x${string}`;
  error?: string;
  from?: `0x${string}`;
  to?: `0x${string}`;
}

export interface TreasuryWithdrawalReceipt {
  /** Null until wallet/provider returns a real hash — never fabricated. */
  txHash: `0x${string}` | null;
  chainId: number | null;
  status: 'idle' | 'pending' | 'confirmed' | 'finalized' | 'failed' | 'reorged' | 'rejected';
  confirmations: number | null;
  error?: string;
  submittedAt?: string;
  finalizedAt?: string;
}

export interface TreasuryAccessGate {
  walletConnected: boolean;
  walletAddress: `0x${string}` | null;
  isAdmin: boolean;
  chainSupported: boolean;
  chainId: number | null;
  abiSupportsWithdraw: boolean;
  configComplete: boolean;
  adminAddress: `0x${string}` | null;
  blockReason: string | null;
}

export const TREASURY_TYPED_CONFIRM_PHRASE = 'WITHDRAW';
export const TREASURY_STALE_MS = 60_000;
