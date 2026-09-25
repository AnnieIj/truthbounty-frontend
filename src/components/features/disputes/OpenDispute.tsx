import { useState, useEffect, useRef, useCallback } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { useDisputeContext } from '@/hooks/useDisputeContext';
import { useDisputeSubmission, formatBondAmount } from '@/hooks/useDisputeSubmission';
import { useWriteReadiness } from '@/hooks/useWriteReadiness';
import { getContractAddress } from '@/lib/contracts/registry';
import type { DisputeSubmissionPayload } from '@/app/types/dispute';

interface OpenDisputeProps {
  claimId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (disputeId: string) => void;
  onError?: (error: string) => void;
}

export const OpenDispute = ({ claimId, isOpen, onClose, onSuccess, onError }: OpenDisputeProps) => {
  const [reason, setReason] = useState('');
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // onSuccess is only invoked after a real on-chain write returns a dispute id.
  // Projected/simulated IDs are never treated as success (V2-FE-100).
  const handleRealSuccess = onSuccess;

  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLTextAreaElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Fetch dispute context
  const contractAddress = getContractAddress('TruthBountyWeighted');
  const {
    context,
    isLoading: isLoadingContext,
    error: contextError,
  } = useDisputeContext({
    claimId,
    contractAddress,
    enabled: isOpen, // Only fetch when modal is open
    pollInterval: 0, // No polling for modal
  });

  // Dispute submission hooks
  const {
    validateDispute,
    simulateDispute,
    submitDispute,
    isSimulating,
    isSubmitting,
    error: submissionHookError,
  } = useDisputeSubmission();

  // V2-FE-100: fail-closed wallet/chain readiness for the Confirm action
  const readiness = useWriteReadiness({
    targetAddress: contractAddress,
    requireCanonicalMatch: true,
    enabled: isOpen,
  });

  // Clear errors when modal opens
  useEffect(() => {
    if (isOpen) {
      setSubmissionError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
    }
    return () => {
      if (!isOpen) {
        previousActiveElement.current?.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      firstFocusableRef.current?.focus();
    }
  }, [isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }, [onClose]);

  const handleFocusTrap = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;

    const focusableElements = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (!focusableElements || focusableElements.length === 0) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else if (document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!context || !context.walletPosition.userAddress) {
      setSubmissionError('Wallet not connected or context not loaded');
      return;
    }

    // V2-FE-100: fail closed when wallet/chain is not ready
    if (!readiness.isReady) {
      const reason = readiness.message || 'Wallet is not ready to submit this dispute.';
      setSubmissionError(reason);
      onError?.(reason);
      return;
    }

    setSubmissionError(null);

    try {
      // Create payload
      const payload: DisputeSubmissionPayload = {
        claimId,
        reason,
        bondAmount: context.bond.bondAmount,
        userAddress: context.walletPosition.userAddress,
      };

      // Validate
      const validation = validateDispute(context, payload);
      if (!validation.isValid) {
        setSubmissionError(validation.errors.join('; '));
        onError?.(validation.errors.join('; '));
        return;
      }

      // Simulate first
      const simulation = await simulateDispute(context, payload);
      if (!simulation.success) {
        setSubmissionError(simulation.error || 'Simulation failed');
        onError?.(simulation.error || 'Simulation failed');
        return;
      }

      // Never invent a dispute ID or success state without a real on-chain write.
      // submitDispute fails closed until wallet writeContract is integrated.
      const tx = await submitDispute(context, payload);
      if (tx?.transactionHash) {
        handleRealSuccess?.(tx.disputeId ?? tx.transactionHash);
        onClose();
        setReason('');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to submit dispute';
      setSubmissionError(errorMsg);
      onError?.(errorMsg);
    }
  };

  // Combined loading state
  const isLoading = isLoadingContext || isSimulating || isSubmitting;

  // Combined error
  const displayError = submissionError || contextError || submissionHookError;

  // V2-FE-100: block submit until readiness passes; expose reason accessibly
  const canSubmit =
    readiness.isReady &&
    Boolean(context?.isEligible) &&
    Boolean(reason.trim()) &&
    !isLoading;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 modal-shell bg-black/80 backdrop-blur-sm"
      role="presentation"
      onKeyDown={handleFocusTrap}
    >
      <div
        ref={modalRef}
        className="modal-panel border border-zinc-800 bg-[#111111] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispute-modal-title"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle size={18} aria-hidden="true" />
            <h2 id="dispute-modal-title" className="text-base sm:text-lg font-bold text-white">Open Dispute</h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white p-1"
            aria-label="Close dispute modal"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          {/* Error display */}
          {displayError && (
            <div
              className="rounded-lg bg-red-950/30 border border-red-900/50 p-3 text-sm text-red-300"
              role="alert"
            >
              {displayError}
            </div>
          )}

          {/* Loading context */}
          {isLoadingContext && (
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              <span>Loading dispute context...</span>
            </div>
          )}

          {/* Eligibility check */}
          {context && !context.isEligible && (
            <div
              className="rounded-lg bg-yellow-950/30 border border-yellow-900/50 p-3 text-sm text-yellow-300"
              role="alert"
            >
              {context.ineligibilityReason || 'You are not eligible to open a dispute'}
            </div>
          )}

          {/* Bond amount display */}
          {context && (
            <div className="rounded-lg bg-zinc-900/50 border border-zinc-700 p-3">
              <div className="text-sm text-zinc-400 mb-1">Required Challenge Bond</div>
              <div className="text-lg font-bold text-white">
                {formatBondAmount(context.bond.bondAmount)} ETH
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                Your balance: {formatBondAmount(context.walletPosition.currentBalance)} ETH
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1" htmlFor="dispute-reason">
              Reason for Dispute *
            </label>
            <textarea
              ref={firstFocusableRef}
              id="dispute-reason"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/50 p-2.5 sm:p-3 text-white placeholder:text-zinc-600 focus:border-red-500 focus:outline-none text-base"
              rows={4}
              placeholder="Explain why this claim's verification is incorrect (minimum 10 characters)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={10}
              disabled={isLoading || !context?.isEligible}
              aria-required="true"
              aria-describedby="reason-help"
            />
            <div id="reason-help" className="text-xs text-zinc-500 mt-1">
              Provide a clear and detailed explanation for challenging this claim
            </div>
          </div>

          {/* Readiness gate (V2-FE-100) — fail closed with accessible reason */}
          {isOpen && !readiness.isReady && readiness.message && (
            <div
              data-testid="write-readiness-reason"
              className="rounded-lg bg-amber-950/30 border border-amber-900/50 p-3 text-sm text-amber-300"
              role="status"
            >
              {readiness.message}
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-4 sm:mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 sm:py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
              aria-label="Cancel dispute"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2.5 sm:py-2 rounded-lg bg-red-600 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              aria-label={
                isLoading
                  ? "Submitting dispute..."
                  : !readiness.isReady
                    ? readiness.message || "Wallet not ready to submit dispute"
                    : "Confirm dispute"
              }
              aria-describedby={!readiness.isReady ? "write-readiness-reason" : undefined}
            >
              {isLoading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {isSimulating ? 'Simulating...' : isSubmitting ? 'Submitting...' : 'Confirm Dispute'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
