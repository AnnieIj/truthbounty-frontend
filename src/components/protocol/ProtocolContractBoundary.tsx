'use client';

import React, { useMemo } from 'react';
import {
  resolveProtocolContractUi,
  type ProtocolLifecycleState,
  type ProtocolContractSnapshot,
} from '@/lib/protocol-contract';
import { ProtocolContractStatus } from './ProtocolContractStatus';

export interface ProtocolContractBoundaryProps {
  chainId: number;
  /** Real lifecycle from wallet/receipt evidence. Omit for idle/empty. */
  lifecycle?: ProtocolLifecycleState;
  children: React.ReactNode;
  /** When false, still render children but surface status (default: true). */
  blockWhenNotReady?: boolean;
  /** Injected snapshot for deterministic component tests. */
  snapshotOverride?: ProtocolContractSnapshot;
  className?: string;
}

/**
 * Fail-closed gate around protocol mutation UI.
 * Children render only when the canonical Optimism/EVM protocol artifact is
 * ready and the lifecycle is not a blocking uncertainty/failure state.
 */
export function ProtocolContractBoundary({
  chainId,
  lifecycle,
  children,
  blockWhenNotReady = true,
  snapshotOverride,
  className,
}: ProtocolContractBoundaryProps) {
  const snapshot = useMemo(
    () =>
      snapshotOverride ??
      resolveProtocolContractUi({
        chainId,
        lifecycle,
      }),
    [snapshotOverride, chainId, lifecycle],
  );

  const showChildren = !blockWhenNotReady || snapshot.allowsMutation;

  return (
    <div className={className} data-testid="protocol-contract-boundary">
      <ProtocolContractStatus snapshot={snapshot} compact={showChildren} />
      {showChildren ? (
        children
      ) : (
        <p className="mt-3 text-sm text-amber-200" role="alert">
          Protocol mutation is blocked until canonical chain configuration and
          transaction state are valid. The UI will not invent success, settlement,
          or rewards.
        </p>
      )}
    </div>
  );
}

export default ProtocolContractBoundary;
