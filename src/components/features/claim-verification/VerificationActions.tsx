'use client';

import { useState, useCallback } from 'react';
import { submitVerification } from '@/app/lib/api';
import { TransactionStatus } from './TransactionStatus';
import { useTranslations } from '@/i18n';
import {
  clearPendingTransaction,
  trackPendingTransaction,
} from '@/lib/pending-transactions';
import { ProtocolContractBoundary } from '@/components/protocol/ProtocolContractBoundary';
import { getReleaseChainId } from '@/lib/contracts/registry';
import type { ProtocolLifecycleState } from '@/lib/protocol-contract';

function statusToLifecycle(
  status: 'idle' | 'pending' | 'success' | 'error',
): ProtocolLifecycleState | undefined {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'success':
      return 'confirmed';
    case 'error':
      return 'failed';
    default:
      return undefined;
  }
}

export function VerificationActions({
  claimId,
  stakeAmount,
  chainId,
}: {
  claimId: string;
  stakeAmount: number;
  /** Active wallet chain; defaults to the pinned release chain. */
  chainId?: number;
}) {
  const t = useTranslations('verification');
  const tCommon = useTranslations('common');
  const resolvedChainId = chainId ?? getReleaseChainId();
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (decision: 'verify' | 'reject') => {
    // Fail closed on invalid stake amount
    if (!stakeAmount || stakeAmount <= 0) {
      setStatus('error');
      console.error(t('errors.stakeAmountInvalid'));
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
        title: decision === 'verify' ? t('verificationStakePending') : t('rejectionStakePending'),
        description: t('waitingWalletConfirmation', { claimId }),
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
    <div className="card flex flex-col sm:flex-row gap-3 sm:gap-4 p-4 sm:p-6">
      <button
        onClick={() => submit('verify')}
        className="btn-primary flex-1 py-3 px-4 text-base min-h-[44px] touch-manipulation transition-colors"
      >
        {t('verify')}
      </button>
      <button
        onClick={() => submit('reject')}
        className="btn-danger flex-1 py-3 px-4 text-base min-h-[44px] touch-manipulation transition-colors"
      >
        {t('reject')}
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
    <ProtocolContractBoundary
      chainId={resolvedChainId}
      lifecycle={statusToLifecycle(status)}
      blockWhenNotReady={false}
    >
      <div className="card flex flex-col sm:flex-row gap-3 sm:gap-4 p-4 sm:p-6">
        <button
          onClick={() => submit('verify')}
          className="btn-primary flex-1 py-3 px-4 text-base min-h-[44px] touch-manipulation transition-colors"
        >
          Verify
        </button>
        <button
          onClick={() => submit('reject')}
          className="btn-danger flex-1 py-3 px-4 text-base min-h-[44px] touch-manipulation transition-colors"
        >
          Reject
        </button>

      <TransactionStatus status={status} error={error} />
    </div>
        <TransactionStatus status={status} />
      </div>
    </ProtocolContractBoundary>
  );
}

export default VerificationActions;
