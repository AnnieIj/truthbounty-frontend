'use client';

/**
 * V2-FE-144 — Reorg / replacement reconciliation hook.
 *
 * Subscribes to the canonical `ROLLBACK` / `REPLACEMENT` WebSocket events,
 * validates their payloads (fail-closed), invalidates the affected react-query
 * projections, and exposes an accessible banner view model.
 *
 * Security invariants:
 *  - Caches are only invalidated — projection data is never rewritten locally
 *    with fabricated outcomes. Canonical data arrives via refetch from the API.
 *  - Malformed events leave the tracked state untouched (still fail-closed:
 *    they surface as `unresolved` when reconciliation cannot proceed).
 *  - Only wallet/provider-returned hashes are ever tracked or displayed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useWebSocketContext } from '@/components/providers/WebSocketProvider';
import type { RollbackEvent, ReplacementEvent } from '@/app/types/websocket';
import {
  buildReorgBannerView,
  buildReplacementBannerView,
  isTxHash,
  markReorged,
  planReplacementInvalidation,
  planRollbackInvalidation,
  resolveReorgWithReplacement,
  validateReplacementEvent,
  validateRollbackEvent,
  ReorgReconciliationError,
  type ReorgBannerView,
  type TrackedTransaction,
} from '@/lib/reorg-reconciliation';

export interface UseReorgReconciliationOptions {
  /**
   * The transaction the user submitted (hash must come from the wallet/provider).
   * Omit to observe reorgs without tracking a specific transaction.
   */
  trackedTx?: TrackedTransaction | null;
  /** Called after a validated rollback has been reconciled (caches invalidated). */
  onReorgReconciled?: (event: RollbackEvent) => void;
  /** Called after a validated replacement has been applied. */
  onReplacementApplied?: (event: ReplacementEvent) => void;
  /** Test seam: inject a query client (defaults to the provider one). */
  queryClientOverride?: QueryClient;
}

export interface UseReorgReconciliationResult {
  /** Accessible banner view model (hidden when there is nothing to report). */
  banner: ReorgBannerView;
  /** True while caches are being invalidated for the latest event. */
  isReconciling: boolean;
  /** Acknowledge the current outcome (clears the banner after user review). */
  acknowledge: () => void;
  /** Last validation/reconciliation error description, if any. */
  error: string | null;
}

function invalidateProjections(client: QueryClient, roots: readonly string[]): void {
  for (const root of roots) {
    client.invalidateQueries({ queryKey: [root] });
  }
}

export function useReorgReconciliation(
  options: UseReorgReconciliationOptions = {},
): UseReorgReconciliationResult {
  const {
    trackedTx = null,
    onReorgReconciled,
    onReplacementApplied,
    queryClientOverride,
  } = options;

  const contextQueryClient = useQueryClient();
  const queryClient = queryClientOverride ?? contextQueryClient;

  const { subscribe, isConnected, clearPersistedCursor } = useWebSocketContext();

  // Server-tracked state: the transaction with its reorg-facing status.
  const [tracked, setTracked] = useState<TrackedTransaction | null>(trackedTx ?? null);
  const [rollbackDetected, setRollbackDetected] = useState(false);
  const [reconciliationFailed, setReconciliationFailed] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [replacementNotice, setReplacementNotice] = useState<{
    orphanedHash: `0x${string}` | null;
    replacementHash: `0x${string}`;
  } | null>(null);

  // Keep the latest tracked tx prop accessible inside stable subscriptions.
  const trackedTxRef = useRef<TrackedTransaction | null>(trackedTx ?? null);
  useEffect(() => {
    trackedTxRef.current = trackedTx ?? null;
    // Sync server state with a newly provided tracked transaction.
    setTracked(trackedTx ?? null);
    setReconciliationFailed(false);
    setRollbackDetected(false);
    setAcknowledged(false);
    setReplacementNotice(null);
  }, [trackedTx]);

  const callbacksRef = useRef({ onReorgReconciled, onReplacementApplied });
  useEffect(() => {
    callbacksRef.current = { onReorgReconciled, onReplacementApplied };
  }, [onReorgReconciled, onReplacementApplied]);

  const invalidate = useCallback(
    (roots: readonly string[]) => {
      setIsReconciling(true);
      try {
        invalidateProjections(queryClient, roots);
      } finally {
        setIsReconciling(false);
      }
    },
    [queryClient],
  );

  // Subscribe once — handlers read refs so they never go stale.
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribers: Array<() => void> = [];

    unsubscribers.push(
      subscribe('ROLLBACK', (payload) => {
        const validation = validateRollbackEvent(payload);
        if (!validation.ok) {
          // Fail closed: keep previous state; surface an error and mark
          // projections stale so nothing stale is presented as fresh.
          setError(`Reorg event rejected: ${validation.reason}`);
          setReconciliationFailed(true);
          invalidate(['claims', 'verifications', 'disputes']);
          return;
        }

        const event = validation.event as RollbackEvent;
        const current = trackedTxRef.current;
        setRollbackDetected(true);
        setTracked((prev) => {
          const base = prev ?? current;
          return base && isTxHash(base.hash) ? markReorged(base) : prev;
        });
        setAcknowledged(false);
        setReplacementNotice(null);
        setError(null);

        const plan = planRollbackInvalidation(event);
        invalidate(plan.queryKeyRoots);
        // Resume the canonical projection stream from the last valid cursor.
        clearPersistedCursor();

        callbacksRef.current.onReorgReconciled?.(event);
      }),
    );

    unsubscribers.push(
      subscribe('REPLACEMENT', (payload) => {
        const validation = validateReplacementEvent(payload);
        if (!validation.ok) {
          setError(`Replacement event rejected: ${validation.reason}`);
          setReconciliationFailed(true);
          invalidate(['claims', 'verifications']);
          return;
        }

        const event = validation.event as ReplacementEvent;
        const current = trackedTxRef.current;

        let orphanedHash: `0x${string}` | null = null;
        if (current && isTxHash(current.hash)) {
          orphanedHash = current.hash;
        }

        setAcknowledged(false);
        setError(null);

        const plan = planReplacementInvalidation(event);
        invalidate(plan.queryKeyRoots);

        // Replacement events carry their own newCursor — no cursor reset.

        // The canonical replacement hash lives in `newData` when provided as a
        // hash-shaped string; otherwise we can only scope the banner to the
        // orphaned transaction without inventing a hash.
        const candidate = event.newData;
        const replacementHash =
          isTxHash(candidate) ? candidate : isTxHash((candidate as { txHash?: unknown })?.txHash) ? ((candidate as { txHash: `0x${string}` }).txHash) : null;

        if (replacementHash) {
          setReplacementNotice({
            orphanedHash,
            replacementHash,
          });
          if (current && isTxHash(current.hash)) {
            setTracked((prev) => {
              const base = prev ?? current;
              if (base.status === 'reorged') {
                try {
                  return resolveReorgWithReplacement(base, replacementHash);
                } catch (err) {
                  if (err instanceof ReorgReconciliationError) {
                    setError(err.message);
                    setReconciliationFailed(true);
                    return base;
                  }
                  throw err;
                }
              }
              return base;
            });
          }
          callbacksRef.current.onReplacementApplied?.(event);
        } else {
          // No canonical hash available — scope the reconciliation to cache
          // invalidation only and fail closed on the banner.
          setReconciliationFailed(true);
          callbacksRef.current.onReplacementApplied?.(event);
        }
      }),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [isConnected, subscribe, invalidate, clearPersistedCursor]);

  const acknowledge = useCallback(() => {
    setAcknowledged(true);
  }, []);

  const banner = useMemo<ReorgBannerView>(() => {
    const base = buildReorgBannerView(tracked, { reconciliationFailed, rollbackDetected });
    if (acknowledged && base.state !== 'hidden') {
      return { ...base, state: 'hidden', message: '', detail: '', assertive: false };
    }
    if (replacementNotice) {
      return buildReplacementBannerView(
        replacementNotice.orphanedHash,
        replacementNotice.replacementHash,
      );
    }
    return base;
  }, [tracked, reconciliationFailed, rollbackDetected, acknowledged, replacementNotice]);

  return { banner, isReconciling, acknowledge, error };
}
