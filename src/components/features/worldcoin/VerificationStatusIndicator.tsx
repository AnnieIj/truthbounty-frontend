'use client';

import { useMemo } from 'react';
import { Shield, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import type { WorldcoinVerificationStatus } from '@/app/types/worldcoin';
import { cn } from '@/lib/utils';
import { formatLocalDateTime, formatUtcDateTime } from '@/app/lib/format';
import { useNow } from '@/components/hooks/useNow';
import {
  isDeadlineWithinHorizon,
  parseTimestampMs,
  resolveDeadlineState,
} from '@/app/lib/protocol-time';

interface VerificationStatusIndicatorProps {
  status: WorldcoinVerificationStatus;
  verificationLevel?: 'orb' | 'device';
  expiresAt?: string;
  className?: string;
  showLabel?: boolean;
}

const EXPIRING_SOON_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

export function VerificationStatusIndicator({
  status,
  verificationLevel,
  expiresAt,
  className,
  showLabel = true,
}: VerificationStatusIndicatorProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'SUCCESS':
        return {
          icon: CheckCircle2,
          label: verificationLevel === 'orb' ? 'Orb Verified' : 'Device Verified',
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-950/30',
          borderColor: 'border-green-200 dark:border-green-800',
        };
      case 'IN_PROGRESS':
        return {
          icon: Clock,
          label: 'Verifying...',
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-950/30',
          borderColor: 'border-blue-200 dark:border-blue-800',
        };
      case 'FAILED':
        return {
          icon: XCircle,
          label: 'Verification Failed',
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-950/30',
          borderColor: 'border-red-200 dark:border-red-800',
        };
      case 'EXPIRED':
        return {
          icon: AlertTriangle,
          label: 'Verification Expired',
          color: 'text-orange-600 dark:text-orange-400',
          bgColor: 'bg-orange-50 dark:bg-orange-950/30',
          borderColor: 'border-orange-200 dark:border-orange-800',
        };
      default:
        return {
          icon: Shield,
          label: 'Not Verified',
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-50 dark:bg-gray-950/30',
          borderColor: 'border-gray-200 dark:border-gray-800',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const deadlineMs = expiresAt ? parseTimestampMs(expiresAt) : null;
  const nowMs = useNow();

  const deadlineState = resolveDeadlineState({
    deadlineMs,
    nowMs,
    canonicallyExpired: status === 'EXPIRED',
  });
  const expired = deadlineState === 'EXPIRED';

  const expiringSoon =
    status === 'SUCCESS' &&
    !expired &&
    isDeadlineWithinHorizon({
      deadlineMs,
      nowMs,
      horizonMs: EXPIRING_SOON_HORIZON_MS,
    }) === true;

  const statusSuffix = expired ? ' (expired)' : expiringSoon ? ' (expires soon)' : '';
  const absoluteContext =
    deadlineMs !== null
      ? ` · Expires ${formatLocalDateTime(deadlineMs)} (${formatUtcDateTime(deadlineMs)})`
      : '';
  const accessibleName = `${config.label}${statusSuffix}${absoluteContext}`;
  const isExpiringSoon = useMemo(() => {
    return expiresAt && status === 'SUCCESS'
      ? new Date(expiresAt).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
      : false;
  }, [expiresAt, status]);

  return (
    <div
      role="status"
      aria-label={accessibleName}
      title={accessibleName}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border',
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <Icon className={cn('size-4', config.color)} aria-hidden="true" />
      {showLabel && (
        <span className={cn('text-sm font-medium', config.color)}>
          {config.label}
        </span>
      )}
      {expiringSoon && (
        <span className="text-xs text-orange-600 dark:text-orange-400">
          (Expires soon)
        </span>
      )}
    </div>
  );
}