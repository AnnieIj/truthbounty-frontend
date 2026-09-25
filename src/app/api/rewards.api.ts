// src/app/api/rewards.api.ts — V2-FE-060

import type { RawRewardEntitlement } from '@/app/types/rewards';

/**
 * Fetch finalized claimable reward entitlements for an address from the
 * backend projection (V2-BE-017).
 *
 * The response is untrusted input; callers must pass it through
 * `validateRewardEntitlements` before use. This client performs no
 * validation itself and never fabricates entitlements.
 */
export async function fetchRewardEntitlements(
  address: `0x${string}`,
): Promise<RawRewardEntitlement[]> {
  const res = await fetch(
    `/api/rewards?user=${encodeURIComponent(address)}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch reward entitlements (${res.status})`);
  }
  return (await res.json()) as RawRewardEntitlement[];
}
