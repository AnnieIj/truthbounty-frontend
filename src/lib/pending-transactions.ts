/**
 * Pending transaction registry — V2 schema.
 *
 * V2-FE-009: Extended PendingTransactionEntry with txHash, chainId, and
 * machineState so entries carry enough data for reload recovery. Storage key
 * bumped to v2 to discard stale v1 records that lack these fields.
 */

import type { TransactionStatus } from '@/lib/transaction-machine/transaction-machine.types';

export type PendingTransactionKind = 'verification' | 'rewards' | 'dispute' | 'treasury';

export interface PendingTransactionEntry {
  id: string;
  kind: PendingTransactionKind;
  title: string;
  description: string;
  createdAt: number;
  /** On-chain transaction hash, or null while still in preparing/signature-requested. */
  txHash: `0x${string}` | null;
  /** Chain ID the transaction was submitted on. */
  chainId: number | null;
  /** Current state machine status for this transaction. */
  machineState: TransactionStatus;
}

// Bump key to v2 — stale v1 entries (without txHash/chainId/machineState) are discarded
const STORAGE_KEY = 'truthbounty-pending-transactions-v2';
const EVENT_NAME = 'truthbounty:pending-transactions';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readStore(): PendingTransactionEntry[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Guard: must be an array; entries without machineState are stale v1 — discard
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is PendingTransactionEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof e.id === 'string' &&
        typeof e.machineState === 'string',
    );
  } catch {
    return [];
  }
}

function writeStore(entries: PendingTransactionEntry[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: entries }));
}

export function getPendingTransactions(): PendingTransactionEntry[] {
  return readStore().sort((left, right) => right.createdAt - left.createdAt);
}

export function trackPendingTransaction(
  entry: Omit<PendingTransactionEntry, 'createdAt'>,
): void {
  const existing = readStore().filter((item) => item.id !== entry.id);
  existing.push({ ...entry, createdAt: Date.now() });
  writeStore(existing);
}

export function clearPendingTransaction(id: string): void {
  const remaining = readStore().filter((item) => item.id !== id);
  writeStore(remaining);
}

export function subscribeToPendingTransactions(
  listener: (entries: PendingTransactionEntry[]) => void,
): () => void {
  if (!isBrowser()) return () => undefined;

  const handleChange = () => listener(getPendingTransactions());
  window.addEventListener(EVENT_NAME, handleChange as EventListener);
  window.addEventListener('storage', handleChange);
  return () => {
    window.removeEventListener(EVENT_NAME, handleChange as EventListener);
    window.removeEventListener('storage', handleChange);
  };
}
