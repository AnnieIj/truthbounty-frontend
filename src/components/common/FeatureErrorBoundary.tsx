'use client';

import { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export interface FeatureErrorBoundaryProps {
  children: ReactNode;
  /** Feature scope, e.g. "claim-verification", "rewards", "dispute". */
  scope: string;
  resetKeys?: unknown[];
}

/**
 * Feature-scoped boundary for claim/verification/dispute/reward/wallet UI.
 * Isolates feature faults without unmounting sibling routes or clearing
 * pending-transaction recovery state.
 */
export function FeatureErrorBoundary({ children, scope, resetKeys }: FeatureErrorBoundaryProps) {
  return (
    <ErrorBoundary scope={`feature:${scope}`} resetKeys={resetKeys}>
      {children}
    </ErrorBoundary>
  );
}
