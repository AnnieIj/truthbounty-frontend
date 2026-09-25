/**
 * V2 Transaction State Selectors & Utilities
 *
 * Type-safe selectors for transaction states.
 * Prevents premature success messages or actionable stale state.
 * All selectors validate state transitions and prevent invalid operations.
 */

import type {
  Transaction,
  TransactionStateName,
  TransactionSubmitted,
  TransactionConfirmed,
  TransactionSafe,
  TransactionFinalized,
  TransactionIndexing,
  TransactionIndexed,
  TransactionFailed,
  TransactionMetadata,
  StalenessConfig,
} from '@/app/types/transaction';
import type { ChainFinality } from '@/config/chains';
import { getChainConfig } from '@/config/chains';

/**
 * Type guards for each transaction state
 */
export function isSubmitted(tx: Transaction): tx is TransactionSubmitted {
  return 'state' in tx && tx.state === 'submitted';
}

export function isConfirmed(tx: Transaction): tx is TransactionConfirmed {
  return 'state' in tx && tx.state === 'confirmed';
}

export function isSafe(tx: Transaction): tx is TransactionSafe {
  return 'state' in tx && tx.state === 'safe';
}

export function isFinalized(tx: Transaction): tx is TransactionFinalized {
  return 'state' in tx && tx.state === 'finalized';
}

export function isIndexing(tx: Transaction): tx is TransactionIndexing {
  return 'state' in tx && tx.state === 'indexing';
}

export function isIndexed(tx: Transaction): tx is TransactionIndexed {
  return 'state' in tx && tx.state === 'indexed';
}

export function isFailed(tx: Transaction): tx is TransactionFailed {
  return 'state' in tx && (tx.state === 'failed' || tx.state === 'rejected' || tx.state === 'reverted');
}

/**
 * Check if transaction is in a pending state (not yet confirmed/finalized/indexed/failed)
 */
export function isPending(tx: Transaction): boolean {
  return isSubmitted(tx);
}

/**
 * Check if transaction has a terminal state (cannot transition further)
 */
export function isTerminal(tx: Transaction): boolean {
  return isFailed(tx) || isIndexed(tx);
}

/**
 * Check if transaction has receipt/confirmation data
 */
type TransactionWithReceipt =
  | TransactionConfirmed
  | TransactionSafe
  | TransactionFinalized
  | TransactionIndexing
  | TransactionIndexed;

export function hasReceipt(tx: Transaction): tx is TransactionWithReceipt {
  return isConfirmed(tx) || isSafe(tx) || isFinalized(tx) || isIndexing(tx) || isIndexed(tx);
}

/**
 * Extract transaction hash safely
 */
export function getTxHash(tx: Transaction): string | null {
  return 'hash' in tx && tx.hash ? tx.hash : null;
}

/**
 * Extract block number if confirmed
 */
export function getBlockNumber(tx: Transaction): bigint | null {
  if (!hasReceipt(tx)) return null;
  return tx.blockNumber;
}

/**
 * Check if receipt indicates success (may still be reverted)
 */
export function getReceiptStatus(tx: Transaction): 'success' | 'reverted' | 'failed' | null {
  if (!hasReceipt(tx)) return null;
  return tx.receipt?.status ?? null;
}

/**
 * Check if transaction was successfully executed (receipt status = success)
 */
export function isReceiptSuccess(tx: Transaction): boolean {
  return getReceiptStatus(tx) === 'success';
}

/**
 * Check if transaction was reverted/failed at execution
 */
export function isReceiptFailed(tx: Transaction): boolean {
  const status = getReceiptStatus(tx);
  return status === 'reverted' || status === 'failed';
}

/**
 * Get display-friendly state name
 */
export function getStateName(state: TransactionStateName): string {
  const names: Record<TransactionStateName, string> = {
    submitted: 'Submitted',
    confirmed: 'Confirmed',
    safe: 'Safe',
    finalized: 'Finalized',
    indexing: 'Indexing',
    indexed: 'Complete',
  };
  return names[state] ?? state;
}

/**
 * Determine if transaction can transition to next state
 */
export function canTransitionToState(
  currentTx: Transaction,
  nextState: Transaction['state'],
  config: ChainFinality
): boolean {
  if (!('state' in currentTx)) return false;

  const current = currentTx.state;

  // Valid state transitions
  const validTransitions: Record<Transaction['state'], Transaction['state'][]> = {
    submitted: ['confirmed', 'failed', 'rejected'],
    confirmed: ['safe', 'failed', 'rejected', 'reverted'],
    safe: ['finalized', 'failed', 'rejected'],
    finalized: ['indexing', 'failed', 'rejected'],
    indexing: ['indexed'],
    indexed: [], // Terminal state
    failed: [],
    rejected: [],
    reverted: [],
  };

  return validTransitions[current].includes(nextState);
}

/**
 * Check if transaction is stale based on config and metadata
 */
export function isStale(
  tx: Transaction,
  metadata: TransactionMetadata,
  config: StalenessConfig
): boolean {
  const age = Date.now() - metadata.createdAt;

  // If terminal state, not stale
  if (isTerminal(tx)) return false;

  // If exceeds max age, is stale
  if (age > config.maxAgeMs) return true;

  // If pending and exceeds max confirmation time, is stale
  if (isPending(tx) && age > config.maxConfirmationTimeMs) return true;

  return false;
}

/**
 * Should prevent success message from showing
 * Returns true if we should NOT show a success message yet
 */
export function shouldWaitForFinality(
  tx: Transaction,
  metadata: TransactionMetadata,
  config: ChainFinality
): boolean {
  // Don't show success if:
  // 1. Still pending submission
  if (isPending(tx)) return true;

  // 2. Confirmed but not safe (reorg risk)
  if (isConfirmed(tx) && !isSafe(tx)) return true;

  // 3. Safe but not finalized (for critical operations)
  if (isSafe(tx) && !isFinalized(tx)) return true;

  // 4. On L2, finality is not sufficient for projection-backed UI.
  // Wait until the canonical indexer has observed the finalized transaction.
  if (config.isL2 && (isFinalized(tx) || isIndexing(tx))) {
    return true;
  }

  // 5. Replaced txs must not surface as durable success until the
  // replacement hash itself reaches finality.
  // (Machine "replaced" is outside the domain Transaction union — check loosely.)
  const looseState = (tx as { state?: string }).state;
  if (looseState === 'replaced') {
    return true;
  }

  return false;
}

/**
 * Check if receipt status indicates actionable result
 * (should not show actionable state if receipt is reverted)
 */
export function isReceiptActionable(tx: Transaction): boolean {
  if (!hasReceipt(tx)) return false;

  const status = getReceiptStatus(tx);
  if (status !== 'success') return false;

  // Receipt succeeded - now check if we should wait for finality
  // This is handled by shouldWaitForFinality() separately
  return true;
}

/**
 * Get user-friendly message for current state
 */
export function getStateMessage(
  tx: Transaction,
  metadata: TransactionMetadata,
  config: ChainFinality
): string {
  if (!('state' in tx)) return 'Unknown state';

  const isStaleState = isStale(tx, metadata, config.staleness);

  if (isFailed(tx)) {
    const reason = tx.reason ?? 'unknown';
    const reasonMap: Record<string, string> = {
      'insufficient-balance': 'Insufficient balance',
      'nonce-too-low': 'Nonce error',
      'replacement-underpriced': 'Gas price too low',
      'revert': 'Transaction reverted',
      'timeout': 'Operation timed out',
      'user-rejected': 'You rejected the transaction',
      'network-error': 'Network error',
      'unknown': 'Transaction failed',
    };
    return `Failed: ${reasonMap[reason]}`;
  }

  if (isSubmitted(tx)) {
    return isStaleState ? 'Submission stale - check blockchain' : 'Submitting transaction...';
  }

  if (isConfirmed(tx)) {
    if (isReceiptFailed(tx)) return 'Transaction reverted on-chain';
    return isStaleState ? 'Awaiting confirmation (stale)' : 'Waiting for confirmations...';
  }

  if (isSafe(tx)) {
    if (isReceiptFailed(tx)) return 'Transaction reverted on-chain';
    return isStaleState ? 'Safe (stale) - refresh status' : 'Transaction safe';
  }

  if (isFinalized(tx)) {
    if (isReceiptFailed(tx)) return 'Transaction finalized but reverted';
    return isStaleState ? 'Finalized (stale) - refresh' : 'Transaction finalized';
  }

  if (isIndexing(tx)) {
    return 'Indexing transaction data...';
  }

  if (isIndexed(tx)) {
    return 'Transaction complete';
  }

  return 'Unknown state';
}

/**
 * Calculate progress percentage through state machine
 */
export function getProgressPercentage(tx: Transaction): number {
  if (!('state' in tx)) return 0;

  const progressMap: Record<Transaction['state'], number> = {
    submitted: 10,
    confirmed: 30,
    safe: 50,
    finalized: 75,
    indexing: 90,
    indexed: 100,
    failed: 0,
    rejected: 0,
    reverted: 100, // Reverted = complete (just failed)
  };

  return progressMap[tx.state];
}

/**
 * Validate transaction integrity
 * Ensures no fabricated data
 */
export interface TransactionValidationError {
  field: string;
  error: string;
}

export function validateTransaction(
  tx: Transaction,
  expectedChainId?: number
): TransactionValidationError[] {
  const errors: TransactionValidationError[] = [];

  if (!('state' in tx)) {
    errors.push({ field: 'state', error: 'Missing state' });
    return errors;
  }

  // Validate hash format
  if ('hash' in tx && tx.hash && !/^0x[a-fA-F0-9]{64}$/.test(tx.hash)) {
    errors.push({ field: 'hash', error: 'Invalid transaction hash format' });
  }

  // Validate addresses
  if ('fromAddress' in tx && tx.fromAddress && !/^0x[a-fA-F0-9]{40}$/.test(tx.fromAddress)) {
    errors.push({ field: 'fromAddress', error: 'Invalid address format' });
  }
  if ('toAddress' in tx && tx.toAddress && !/^0x[a-fA-F0-9]{40}$/.test(tx.toAddress)) {
    errors.push({ field: 'toAddress', error: 'Invalid address format' });
  }

  // Validate chain ID
  if ('chainId' in tx && expectedChainId && tx.chainId !== expectedChainId) {
    errors.push({ field: 'chainId', error: `Wrong chain: expected ${expectedChainId}, got ${tx.chainId}` });
  }

  // Validate amount (must be exact integer string or bigint)
  if ('amount' in tx && tx.amount && !/^\d+$/.test(tx.amount)) {
    errors.push({ field: 'amount', error: 'Amount must be exact integer' });
  }

  // Validate receipt if present
  if (hasReceipt(tx)) {
    if (!tx.blockNumber || typeof tx.blockNumber !== 'bigint') {
      errors.push({ field: 'blockNumber', error: 'Missing block number' });
    }
    if (!tx.receipt?.status) {
      errors.push({ field: 'receipt.status', error: 'Missing receipt status' });
    }
  }

  return errors;
}

/**
 * Safety check: never fabricate transaction data
 * Ensure all blockchain data comes from RPC/indexer, never generated
 */
export function assertNoFabricatedData(tx: Transaction): void {
  if (!('hash' in tx) || !tx.hash) {
    throw new Error('Transaction hash is required - never generate mock hashes');
  }

  // Validate addresses before hash heuristics so a dummy address is
  // reported deterministically even when the supplied hash is also suspicious.
  const dummyPatterns = [
    '0x0000000000000000000000000000000000000000',
    '0x1111111111111111111111111111111111111111',
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ];

  if ('fromAddress' in tx && typeof tx.fromAddress === 'string' && dummyPatterns.includes(tx.fromAddress)) {
    throw new Error('Dummy fromAddress detected - must use real addresses');
  }

  if ('toAddress' in tx && typeof tx.toAddress === 'string' && dummyPatterns.includes(tx.toAddress)) {
    throw new Error('Dummy toAddress detected - must use real addresses');
  }

  // Flag obviously fabricated hashes after validating the more specific fields.
  const uniqueChars = new Set(tx.hash.slice(2)).size;
  if (uniqueChars < 8) {
    throw new Error(`Suspicious transaction hash (low entropy): ${tx.hash}`);
  }
}
