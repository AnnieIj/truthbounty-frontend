'use client';

import React from 'react';
import {
  PROTOCOL_LIFECYCLE_LABELS,
  PROTOCOL_READINESS_LABELS,
  type ProtocolContractSnapshot,
  type ProtocolLifecycleState,
} from '@/lib/protocol-contract';

export interface ProtocolContractStatusProps {
  snapshot: ProtocolContractSnapshot;
  /** Optional compact mode for embedding beside action buttons. */
  compact?: boolean;
}

const lifecycleTone: Record<ProtocolLifecycleState, string> = {
  loading: 'text-slate-300',
  empty: 'text-slate-400',
  stale: 'text-amber-400',
  rejected: 'text-orange-400',
  failed: 'text-red-400',
  pending: 'text-sky-400',
  confirmed: 'text-emerald-400',
  finalized: 'text-emerald-300',
  reorged: 'text-red-300',
};

/**
 * Accessible status surface for component-level protocol contract state.
 * Renders readiness + lifecycle labels and blocking reasons only — never
 * invents tx hashes, rewards, or settlement outcomes.
 */
export function ProtocolContractStatus({
  snapshot,
  compact = false,
}: ProtocolContractStatusProps) {
  const readinessLabel = PROTOCOL_READINESS_LABELS[snapshot.readiness];
  const lifecycleLabel = PROTOCOL_LIFECYCLE_LABELS[snapshot.lifecycle];
  const isBlocking = !snapshot.allowsMutation;

  return (
    <div
      className={
        compact
          ? 'flex flex-col gap-1 text-sm'
          : 'rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-sm'
      }
      data-testid="protocol-contract-status"
      data-readiness={snapshot.readiness}
      data-lifecycle={snapshot.lifecycle}
      data-allows-mutation={snapshot.allowsMutation ? 'true' : 'false'}
      role="status"
      aria-live="polite"
    >
      <p className="font-medium text-slate-100">
        <span className="sr-only">Protocol readiness: </span>
        {readinessLabel}
      </p>
      <p className={lifecycleTone[snapshot.lifecycle]}>
        <span className="sr-only">Transaction lifecycle: </span>
        {lifecycleLabel}
      </p>
      {!compact && snapshot.canonicalAddress && (
        <p className="mt-1 font-mono text-xs text-slate-400 break-all">
          Contract: {snapshot.canonicalAddress}
        </p>
      )}
      {!compact && (
        <p className="mt-1 text-xs text-slate-500">
          Protocol {snapshot.protocolVersion} · release chain {snapshot.releaseChainId} ·
          artifact {snapshot.artifact.artifactVersion}
        </p>
      )}
      {isBlocking && snapshot.blockingReasons.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-amber-300" aria-label="Blocking reasons">
          {snapshot.blockingReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ProtocolContractStatus;
