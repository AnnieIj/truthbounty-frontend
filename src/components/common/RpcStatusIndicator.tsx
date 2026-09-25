'use client';

/**
 * RpcStatusIndicator — Small accessible status indicator for RPC health.
 * Renders a dot with tooltip-accessible label for each state.
 * V2-FE-136
 */

import type { RpcProviderStatus } from '@/lib/rpc-fallback/types';

export interface RpcStatusIndicatorProps {
  status: RpcProviderStatus;
  /** Show the human-readable label alongside the dot. Default false. */
  showLabel?: boolean;
  /** Additional CSS classes. */
  className?: string;
}

const STATUS_CONFIG: Record<
  RpcProviderStatus,
  { label: string; dotClass: string; ariaLabel: string }
> = {
  healthy: {
    label: 'RPC healthy',
    dotClass: 'bg-green-500',
    ariaLabel: 'RPC provider status: healthy',
  },
  degraded: {
    label: 'RPC degraded',
    dotClass: 'bg-yellow-400',
    ariaLabel: 'RPC provider status: degraded — data may be delayed',
  },
  unhealthy: {
    label: 'RPC unreachable',
    dotClass: 'bg-red-500',
    ariaLabel: 'RPC provider status: unreachable',
  },
  unknown: {
    label: 'RPC status unknown',
    dotClass: 'bg-gray-400',
    ariaLabel: 'RPC provider status: unknown — checking…',
  },
};

export function RpcStatusIndicator({
  status,
  showLabel = false,
  className = '',
}: RpcStatusIndicatorProps) {
  const cfg = STATUS_CONFIG[status];

  return (
    <span
      role="status"
      aria-label={cfg.ariaLabel}
      title={cfg.ariaLabel}
      data-testid={`rpc-status-${status}`}
      className={`inline-flex items-center gap-1.5 ${className}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-2.5 w-2.5 rounded-full ${cfg.dotClass}`}
      />
      {showLabel && (
        <span className="text-xs text-muted-foreground">{cfg.label}</span>
      )}
    </span>
  );
}
