import React, { useEffect, useState } from 'react';
import { 
  ChainClockAnchor, 
  deriveDeadlineFromBlocks, 
  formatBlockContext, 
  formatDeadlineContext, 
  resolveDeadlineState,
} from '@/app/lib/protocol-time';

export type ChainDataState = 'loading' | 'empty' | 'stale' | 'rejected' | 'failed' | 'pending' | 'confirmed' | 'finalized' | 'reorged';

export interface SafeChainDeadlineProps {
  anchor: ChainClockAnchor | null | undefined;
  targetBlockNumber: bigint | number | string | null | undefined;
  nowMs?: number;
  clockSkewMs?: number;
  canonicallyExpired?: boolean;
  className?: string;
  dataState?: ChainDataState;
  fallbackText?: string;
}

export function SafeChainDeadline({
  anchor,
  targetBlockNumber,
  nowMs,
  clockSkewMs = 0,
  canonicallyExpired,
  className = '',
  dataState = 'confirmed',
  fallbackText = 'Unknown deadline',
}: SafeChainDeadlineProps) {
  const [currentMs, setCurrentMs] = useState(nowMs ?? Date.now());

  useEffect(() => {
    if (nowMs !== undefined) {
      setCurrentMs(nowMs);
      return;
    }
    const interval = setInterval(() => setCurrentMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [nowMs]);

  if (dataState === 'loading' || dataState === 'pending') {
    return (
      <span className={`text-slate-500 animate-pulse ${className}`} aria-busy="true">
        {dataState === 'loading' ? 'Calculating deadline...' : 'Pending confirmation...'}
      </span>
    );
  }

  if (dataState === 'failed' || dataState === 'rejected') {
    return (
      <span className={`text-red-500 ${className}`} role="alert">
        {dataState === 'failed' ? 'Deadline calculation failed' : 'Chain projection rejected'}
      </span>
    );
  }
  
  if (dataState === 'reorged') {
    return (
      <span className={`text-yellow-600 ${className}`} role="alert">
        Chain reorg detected, recalculating...
      </span>
    );
  }

  if (dataState === 'empty' || !anchor || targetBlockNumber == null) {
    return <span className={`text-slate-500 ${className}`}>{fallbackText}</span>;
  }

  const projection = deriveDeadlineFromBlocks(anchor, targetBlockNumber);
  
  const state = resolveDeadlineState({
    deadlineMs: projection.deadlineMs,
    nowMs: currentMs,
    clockSkewMs,
    canonicallyExpired,
  });

  if (state === 'UNKNOWN') {
    return <span className={`text-slate-500 ${className}`}>{fallbackText}</span>;
  }

  const blockContext = formatBlockContext(projection);
  const context = formatDeadlineContext({
    deadlineMs: projection.deadlineMs,
    blockContext,
    includeSeconds: true
  });

  const isStale = dataState === 'stale';

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {isStale && (
        <span 
          className="inline-block w-2 h-2 rounded-full bg-yellow-500" 
          aria-label="Stale data"
          title="Data may be out of date"
        />
      )}
      <time 
        dateTime={projection.deadlineMs ? new Date(projection.deadlineMs).toISOString() : undefined}
        className={`${state === 'EXPIRED' ? 'text-red-600 font-semibold' : 'text-slate-900'} ${isStale ? 'opacity-70' : ''}`}
      >
        {state === 'EXPIRED' ? 'Expired' : context}
      </time>
    </span>
  );
}
