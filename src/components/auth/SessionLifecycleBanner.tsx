'use client';

import React from 'react';

import { Button } from '@/components/ui/button';
import {
  describeSessionHealth,
  describeSessionRefreshFailure,
  type SessionHealth,
  type SessionRefreshFailure,
} from '@/lib/auth/session-lifecycle';

export interface SessionLifecycleBannerProps {
  health: SessionHealth;
  isRefreshing?: boolean;
  error?: SessionRefreshFailure | null;
  requiresReauth?: boolean;
  onRefresh?: () => void;
  onSignInAgain?: () => void;
}

function toneClasses(tone: 'info' | 'warning' | 'error'): string {
  switch (tone) {
    case 'error':
      return 'bg-red-500 text-white';
    case 'warning':
      return 'bg-amber-500 text-black';
    case 'info':
    default:
      return 'bg-blue-600 text-white';
  }
}

/**
 * V2-FE-048 — Non-destructive session lifecycle feedback.
 *
 * Announces rotation, expiry, and revocation states and offers recovery
 * (refresh or sign in again) without discarding in-progress work.
 */
export function SessionLifecycleBanner({
  health,
  isRefreshing = false,
  error = null,
  requiresReauth = false,
  onRefresh,
  onSignInAgain,
}: SessionLifecycleBannerProps) {
  const healthCopy = describeSessionHealth(health);
  const failureCopy = error ? describeSessionRefreshFailure(error) : null;

  const requiresSignIn = requiresReauth || health === 'expired' || health === 'invalid';

  if (requiresSignIn) {
    const copy = failureCopy ?? healthCopy ?? {
      tone: 'warning' as const,
      message: 'Your session ended. Sign in again to continue.',
    };
    return (
      <div
        role="alert"
        aria-live="assertive"
        data-testid="session-lifecycle-banner"
        data-state="reauth"
        className={`${toneClasses(copy.tone)} px-4 sm:px-8 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}
      >
        <p className="text-sm">{copy.message}</p>
        {onSignInAgain && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onSignInAgain}
            aria-label="Sign in again"
          >
            Sign in again
          </Button>
        )}
      </div>
    );
  }

  if (error && error.kind === 'NETWORK') {
    const copy = failureCopy!;
    return (
      <div
        role="alert"
        aria-live="assertive"
        data-testid="session-lifecycle-banner"
        data-state="retry"
        className={`${toneClasses(copy.tone)} px-4 sm:px-8 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}
      >
        <p className="text-sm">{copy.message}</p>
        {onRefresh && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Retry refreshing session"
          >
            {isRefreshing ? 'Refreshing…' : 'Retry'}
          </Button>
        )}
      </div>
    );
  }

  if (health === 'refresh-due') {
    const copy = healthCopy!;
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="session-lifecycle-banner"
        data-state="refresh-due"
        className={`${toneClasses(copy.tone)} px-4 sm:px-8 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}
      >
        <p className="text-sm">{copy.message}</p>
        {onRefresh && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh session now"
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh now'}
          </Button>
        )}
      </div>
    );
  }

  return null;
}

export default SessionLifecycleBanner;
