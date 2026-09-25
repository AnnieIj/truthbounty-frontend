/**
 * Clears wallet-scoped TanStack Query entries when account or chain changes.
 * Complements V2-FE-046 (invalidate on account/chain) using V2-FE-063 keys.
 */

'use client';

import { useEffect, useRef } from 'react';
import { useAccount as useWagmiAccount } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { onWalletScopeChange } from '@/app/queries/walletScope';
import { useIsMounted } from '@/hooks/useIsMounted';

interface ScopeSnapshot {
  address?: string;
  chainId?: number;
}

/**
 * Mount inside QueryClientProvider (optionally under WagmiProvider).
 * No-ops until mounted to avoid SSR/hydration cache churn.
 */
export function useWalletScopedCache(): void {
  const mounted = useIsMounted();
  const queryClient = useQueryClient();
  const { address, chainId, isConnected } = useWagmiAccount();
  const previousRef = useRef<ScopeSnapshot | null>(null);

  useEffect(() => {
    if (!mounted) return;

    const next: ScopeSnapshot | null =
      isConnected && address
        ? { address, chainId: typeof chainId === 'number' ? chainId : undefined }
        : null;

    onWalletScopeChange(queryClient, previousRef.current, next);
    previousRef.current = next;
  }, [mounted, isConnected, address, chainId, queryClient]);
}

/** Headless child for QueryProvider composition. */
export function WalletScopedCacheSync(): null {
  useWalletScopedCache();
  return null;
}
