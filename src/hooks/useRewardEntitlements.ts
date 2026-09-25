'use client';

/**
 * useRewardEntitlements — V2-FE-060
 *
 * Reads finalized claimable balances from the backend projection (V2-BE-017)
 * and validates them into canonical entitlements.
 *
 * Fail-closed properties:
 *  - Requires a connected address on the release chain; otherwise reports
 *    `unsupported` and performs no network I/O.
 *  - All API payloads are untrusted: entries that fail validation are
 *    dropped and surfaced via `rejectedCount`/`rejectionReasons`.
 *  - Amounts remain exact bigint values; no client-side float math.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAccount, useChainId } from 'wagmi';

import { fetchRewardEntitlements } from '@/app/api/rewards.api';
import type {
  RewardEntitlement,
  RewardEntitlementSummary,
} from '@/app/types/rewards';
import { getReleaseChainId } from '@/lib/contracts/registry';
import {
  summarizeRewardEntitlements,
  validateRewardEntitlements,
} from '@/lib/rewards/validate-entitlements';

export interface UseRewardEntitlementsResult {
  /** Canonical validated entitlements (empty until loaded). */
  readonly entitlements: readonly RewardEntitlement[];
  /** Grouped per-asset claimable summary with allocation categories. */
  readonly summary: RewardEntitlementSummary;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error: string | null;
  /** True when the wallet is not connected or on an unsupported chain. */
  readonly isUnsupported: boolean;
  readonly unsupportedReason: string | null;
  /** Re-fetch entitlements after a claim or on demand. */
  readonly refetch: () => Promise<void>;
}

export function useRewardEntitlements(): UseRewardEntitlementsResult {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const releaseChainId = getReleaseChainId();

  const isSupportedChain = chainId === releaseChainId;
  const isUnsupported = !isConnected || !isSupportedChain || !address;

  const unsupportedReason = !isConnected
    ? 'Connect your wallet to view claimable rewards.'
    : !isSupportedChain
      ? `Wrong network. Switch to the protocol chain to view claimable rewards.`
      : null;

  const query = useQuery({
    queryKey: ['rewards', 'entitlements', address ?? null, releaseChainId],
    queryFn: async (): Promise<{
      entitlements: RewardEntitlement[];
      rejectedCount: number;
      rejectionReasons: string[];
    }> => {
      // Fail closed: this query only runs with a validated address on the
      // release chain (guarded by `enabled`), but re-check here anyway.
      if (!address || !isSupportedChain) {
        return { entitlements: [], rejectedCount: 0, rejectionReasons: [] };
      }
      const raw = await fetchRewardEntitlements(address);
      const validated = validateRewardEntitlements(raw);
      if (validated.rejectedCount > 0) {
        // Malformed backend payloads are logged, never coerced into values.
        console.warn(
          '[useRewardEntitlements] rejected invalid entitlement payloads:',
          validated.rejectionReasons,
        );
      }
      return validated;
    },
    enabled: Boolean(address) && isSupportedChain,
    staleTime: 30_000,
    retry: 1,
  });

  const entitlements = query.data?.entitlements ?? [];
  const summary = useMemo(
    () => summarizeRewardEntitlements(entitlements),
    [entitlements],
  );

  const refetch = async (): Promise<void> => {
    await query.refetch();
  };

  return {
    entitlements,
    summary,
    isLoading: query.isPending,
    isError: query.isError,
    error:
      query.error instanceof Error
        ? query.error.message
        : query.isError
          ? 'Failed to load claimable rewards.'
          : null,
    isUnsupported,
    unsupportedReason: isUnsupported ? unsupportedReason : null,
    refetch,
  };
}
