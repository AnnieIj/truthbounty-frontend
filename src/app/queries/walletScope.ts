/**
 * Wallet-scope cache helpers (V2-FE-063).
 *
 * When the connected address or chain changes, only wallet-scoped query
 * namespaces are removed — never a cache-wide clear that would thrash
 * unrelated projections.
 */

import type { QueryClient } from '@tanstack/react-query';
import {
  claimKeys,
  filterKeys,
  finalityKeys,
  normalizeAddress,
  projectionWatermarkKeys,
  walletKeys,
  walletScope,
} from './queryKeys';

/** Roots that are inherently wallet / chain scoped. */
export const WALLET_SCOPED_ROOTS = [
  walletKeys.all,
  filterKeys.all,
  finalityKeys.all,
  projectionWatermarkKeys.all,
] as const;

/**
 * Build the narrow key list for a specific wallet+chain pair.
 * Returns an empty list when scope inputs are unsupported (fail closed).
 */
export function keysForWalletScope(
  address: string | null | undefined,
  chainId: number | null | undefined,
) {
  const scope = walletScope(address, chainId);
  if (!scope) return [] as const;

  return [
    walletKeys.scope(scope.address, scope.chainId),
    walletKeys.balance(scope.address, scope.chainId),
    walletKeys.nonce(scope.address, scope.chainId),
    claimKeys.byWallet(scope.address, scope.chainId),
    filterKeys.activity(scope.address),
    projectionWatermarkKeys.byChain(scope.chainId),
  ] as const;
}

/**
 * Remove cache entries that belong to a prior wallet/chain scope.
 * Prefer `removeQueries` over blanket `clear` to avoid unrelated churn.
 */
export function invalidateWalletScope(
  queryClient: QueryClient,
  address: string | null | undefined,
  chainId: number | null | undefined,
): number {
  const keys = keysForWalletScope(address, chainId);
  if (keys.length === 0) return 0;

  for (const queryKey of keys) {
    queryClient.removeQueries({ queryKey: [...queryKey] });
  }
  return keys.length;
}

/**
 * On account or chain change: drop the previous scope, keep the new one cold.
 * Callers must pass the *previous* scope that is leaving the session.
 */
export function onWalletScopeChange(
  queryClient: QueryClient,
  previous: { address?: string | null; chainId?: number | null } | null,
  next: { address?: string | null; chainId?: number | null } | null,
): { removed: number; previousScope: string | null; nextScope: string | null } {
  const prevAddr = normalizeAddress(previous?.address ?? null);
  const nextAddr = normalizeAddress(next?.address ?? null);
  const prevChain =
    typeof previous?.chainId === 'number' ? previous.chainId : null;
  const nextChain = typeof next?.chainId === 'number' ? next.chainId : null;

  const previousScope =
    prevAddr && prevChain ? `${prevAddr}:${prevChain}` : null;
  const nextScope = nextAddr && nextChain ? `${nextAddr}:${nextChain}` : null;

  if (previousScope && previousScope !== nextScope) {
    const removed = invalidateWalletScope(queryClient, prevAddr, prevChain);
    return { removed, previousScope, nextScope };
  }

  // Disconnect: clear last known wallet roots without touching global claims.
  if (previousScope && !nextScope) {
    const removed = invalidateWalletScope(queryClient, prevAddr, prevChain);
    return { removed, previousScope, nextScope };
  }

  return { removed: 0, previousScope, nextScope };
}
