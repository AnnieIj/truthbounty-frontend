import React from 'react';
import { useClaimWorkflowReadiness } from '../../../hooks/useClaimWorkflowReadiness';
import { TransactionMachineError } from '../../../lib/transaction-machine';

/**
 * V2-FE-110 — Claim Workflow Readiness Gate Component
 *
 * This component acts as a gatekeeper for the claim submission workflow.
 * It verifies wallet connection, account presence, and chain validity.
 *
 * It renders:
 * - Loading state: While wallet status is being determined (if applicable)
 * - Error state: If any readiness check fails
 * - Success/Ready state: If all checks pass, rendering children
 *
 * Accessibility:
 * - Uses aria-live for error announcements
 * - Provides clear visual feedback for states
 */

interface ClaimWorkflowReadinessGateProps {
  children: React.ReactNode;
  /**
   * Optional callback when the gate is ready.
   * Useful for triggering side effects or analytics.
   */
  onReady?: (chainId: number) => void;
}

const ClaimWorkflowReadinessGate: React.FC<ClaimWorkflowReadinessGateProps> = ({
  children,
  onReady,
}) => {
  const { isReady, error, chainId } = useClaimWorkflowReadiness();

  React.useEffect(() => {
    if (isReady && onReady && chainId) {
      onReady(chainId);
    }
  }, [isReady, onReady, chainId]);

  // Error State
  if (!isReady && error) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="claim-gate-error"
        style={{
          padding: '1rem',
          margin: '1rem 0',
          backgroundColor: '#fee2e2',
          border: '1px solid #ef4444',
          borderRadius: '0.375rem',
          color: '#991b1b',
        }}
      >
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>
          Claim Unavailable
        </h3>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>
          {error.message}
        </p>
      </div>
    );
  }

  // Ready State
  if (isReady) {
    return <>{children}</>;
  }

  // Loading/Initial State
  // We show a neutral placeholder while determining readiness
  return (
    <div
      role="status"
      aria-live="polite"
      className="claim-gate-loading"
      style={{
        padding: '1rem',
        margin: '1rem 0',
        backgroundColor: '#f3f4f6',
        border: '1px solid #d1d5db',
        borderRadius: '0.375rem',
        color: '#4b5563',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: 0, fontSize: '0.875rem' }}>
        Checking wallet and network readiness...
      </p>
    </div>
  );
};

export default ClaimWorkflowReadinessGate;