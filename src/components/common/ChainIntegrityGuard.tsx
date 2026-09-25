'use client';

/**
 * ChainIntegrityGuard — Context-aware wrapper that evaluates chain + API
 * integrity and feeds FallbackBoundary.
 * V2-FE-136
 *
 * Reads the current wagmi chain, checks it against supported chains,
 * integrates RPC fallback state, and renders children inside FallbackBoundary.
 *
 * Usage:
 *   <ChainIntegrityGuard>
 *     <ClaimSubmissionForm />
 *   </ChainIntegrityGuard>
 */

import type { ReactNode } from 'react';
import { useChainId } from 'wagmi';
import { isSupportedChain } from '@/config/chains';
import { useRpcFallback } from '@/hooks/useRpcFallback';
import { FallbackBoundary } from './FallbackBoundary';
import type { IntegrityStatus } from '@/lib/rpc-fallback/types';

export interface ChainIntegrityGuardProps {
  children: ReactNode;
  /** Override the wagmi chainId (useful for testing). */
  chainIdOverride?: number;
  /** Pass through to FallbackBoundary. */
  fallback?: ReactNode;
  blockActions?: boolean;
}

export function ChainIntegrityGuard({
  children,
  chainIdOverride,
  fallback,
  blockActions = true,
}: ChainIntegrityGuardProps) {
  const wagmiChainId = useChainId();
  const chainId = chainIdOverride ?? wagmiChainId;

  const { state: rpcState, allUnhealthy, isDegraded } = useRpcFallback(chainId, {
    disableProbing: false,
  });

  const supported = isSupportedChain(chainId);

  let integrityStatus: IntegrityStatus = 'valid';
  let statusReason: string | null = null;

  if (!supported) {
    integrityStatus = 'blocked';
    statusReason = `Chain ${chainId} is not supported. Please switch to Optimism or Optimism Sepolia.`;
  } else if (allUnhealthy) {
    integrityStatus = 'error';
    statusReason = 'All RPC providers are unreachable. Protocol actions are disabled until connectivity is restored.';
  } else if (rpcState?.circuitOpen) {
    integrityStatus = 'blocked';
    statusReason = 'RPC circuit breaker is open. Please wait before retrying.';
  } else if (isDegraded || rpcState?.isUsingFallback) {
    integrityStatus = 'degraded';
    statusReason = rpcState?.isUsingFallback
      ? 'Primary RPC provider is unreachable. A fallback provider is in use; data may be slightly delayed.'
      : 'RPC provider is experiencing degraded performance. Data may be slightly delayed.';
  }

  return (
    <FallbackBoundary
      status={integrityStatus}
      reason={statusReason}
      fallback={fallback}
      blockActions={blockActions}
    >
      {children}
    </FallbackBoundary>
  );
}
