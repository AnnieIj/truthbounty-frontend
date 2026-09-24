'use client';

import { useState, useCallback } from 'react';
import { submitVerification } from '@/app/lib/api';
import { TransactionStatus } from './TransactionStatus';
import {
  clearPendingTransaction,
  trackPendingTransaction,
} from '@/lib/pending-transactions';

export function VerificationActions({
  claimId,
  stakeAmount,
}: {
  claimId: string;
  stakeAmount: number;
}) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (decision: 'verify' | 'reject') => {
    // Fail closed on invalid stake amount
    if (!stakeAmount || stakeAmount <= 0) {
      setStatus('error');
      setError('Invalid stake amount provided.');
      return;
    }

    const transactionId = `verification:${claimId}:${decision}`;

    try {
      setStatus('pending');
      setError(null);
      
      trackPendingTransaction({
        id: transactionId,
        kind: 'verification',
        title: decision === 'verify' ? 'Verification stake pending' : 'Rejection stake pending',
        description: `Claim ${claimId} is waiting for wallet confirmation.`,
        txHash: null,
        chainId: null,
        machineState: 'preparing',
      });
      
      // Submit to canonical API
      await submitVerification({ claimId, decision, stakeAmount });
      
      clearPendingTransaction(transactionId);
      setStatus('success');
    } catch (err) {
      // Fail closed: clear pending state and report error
      clearPendingTransaction(transactionId);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Transaction failed.');
    }
  }, [claimId, stakeAmount]);

  return (
    <div className="card flex flex-col sm:flex-row gap-3 sm:gap-4 p-4 sm:p-6" role="region" aria-label="Verification actions">
      <button
        onClick={() => submit('verify')}
        disabled={status === 'pending'}
        className="btn-primary flex-1 py-3 px-4 text-base min-h-[44px] touch-manipulation transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-busy={status === 'pending'}
      >
        Verify
      </button>
      <button
        onClick={() => submit('reject')}
        disabled={status === 'pending'}
        className="btn-danger flex-1 py-3 px-4 text-base min-h-[44px] touch-manipulation transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-busy={status === 'pending'}
      >
        Reject
      </button>

      <TransactionStatus status={status} error={error} />
    </div>
  );
}

export default VerificationActions;