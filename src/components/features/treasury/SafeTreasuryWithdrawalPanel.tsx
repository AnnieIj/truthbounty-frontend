'use client';

/**
 * SafeTreasuryWithdrawalPanel — V2-FE-119
 * Multi-step, fail-closed admin treasury withdrawal UX.
 */

import React, { useId } from 'react';
import { useSafeTreasuryWithdrawal } from '@/hooks/useSafeTreasuryWithdrawal';
import { TREASURY_TYPED_CONFIRM_PHRASE } from '@/app/types/treasury';
import { getTransactionExplorerUrl } from '@/lib/explorer';
import { formatEther } from 'viem';

function formatWei(wei: string | undefined): string {
  if (!wei) return '—';
  try {
    return `${formatEther(BigInt(wei))} ETH`;
  } catch {
    return `${wei} wei`;
  }
}

function StatusBanner({
  status,
  message,
}: {
  status: string;
  message: string;
}) {
  const tone =
    status === 'confirmed' || status === 'finalized'
      ? 'border-green-900/40 bg-green-900/15 text-green-300'
      : status === 'failed' || status === 'rejected' || status === 'reorged' || status === 'unauthorized'
        ? 'border-red-900/40 bg-red-900/15 text-red-300'
        : status === 'stale' || status === 'unsupported_chain' || status === 'missing_config'
          ? 'border-amber-900/40 bg-amber-900/15 text-amber-200'
          : 'border-[#232329] bg-[#121216] text-[#a1a1aa]';

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${tone}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="treasury-status-banner"
      data-status={status}
    >
      {message}
    </div>
  );
}

export default function SafeTreasuryWithdrawalPanel() {
  const formId = useId();
  const {
    status,
    step,
    draft,
    setDraft,
    balance,
    validation,
    typedConfirm,
    setTypedConfirm,
    simulation,
    receipt,
    gateBlockReason,
    isAdmin,
    refreshBalance,
    goReview,
    goTypedConfirm,
    goBack,
    simulate,
    submit,
    reset,
  } = useSafeTreasuryWithdrawal();

  const statusMessage = (() => {
    switch (status) {
      case 'loading':
        return 'Loading canonical treasury balance…';
      case 'empty':
        return gateBlockReason || 'No withdrawable treasury balance, or wallet not connected.';
      case 'stale':
        return 'Treasury balance snapshot is stale. Refresh before withdrawing.';
      case 'unauthorized':
        return gateBlockReason || 'Only the canonical treasury admin may withdraw.';
      case 'unsupported_chain':
        return gateBlockReason || 'Switch to Optimism Mainnet or OP Sepolia.';
      case 'missing_config':
        return gateBlockReason || 'Canonical configuration incomplete — fail closed.';
      case 'review':
        return 'Review withdrawal details carefully before confirming.';
      case 'confirming':
        return `Type ${TREASURY_TYPED_CONFIRM_PHRASE} to unlock submission.`;
      case 'simulating':
        return 'Simulating withdrawal against the canonical contract…';
      case 'awaiting_signature':
        return 'Waiting for wallet signature. Reject in your wallet to cancel.';
      case 'rejected':
        return receipt.error || 'Wallet rejected the withdrawal request.';
      case 'pending':
        return 'Withdrawal submitted — awaiting confirmations. Outcome is not final yet.';
      case 'failed':
        return receipt.error || 'Withdrawal failed. No success is assumed.';
      case 'confirmed':
        return 'Withdrawal confirmed on-chain. Waiting for deeper finality.';
      case 'finalized':
        return 'Withdrawal finalized. Balance refreshed from chain.';
      case 'reorged':
        return 'A reorg invalidated the prior receipt — refresh and re-verify before retrying.';
      default:
        return isAdmin
          ? 'Ready. Enter recipient and amount. Success is never shown without a real receipt.'
          : 'Connect as the canonical admin on Optimism to withdraw.';
    }
  })();

  const blocked = Boolean(gateBlockReason) && !['rejected', 'failed', 'pending', 'confirmed', 'finalized'].includes(status);

  return (
    <section
      className="bg-[#18181b] rounded-xl border border-[#232329] overflow-hidden"
      aria-labelledby={`${formId}-title`}
      data-testid="safe-treasury-withdrawal-panel"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-b border-[#232329]">
        <div>
          <h2 id={`${formId}-title`} className="text-white font-semibold text-base">
            Safe Treasury Withdrawal
          </h2>
          <p className="text-[#a1a1aa] text-xs mt-1">
            Admin-only. Optimism/EVM. Never fabricates balances or transaction success.
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs text-[#a1a1aa]">Canonical balance</p>
          <p className="text-lg font-semibold text-white" data-testid="treasury-balance">
            {formatWei(balance?.amountWei)}
          </p>
        </div>
      </header>

      <div className="px-6 py-4 space-y-4">
        <StatusBanner status={status} message={statusMessage} />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshBalance()}
            className="px-3 py-1.5 text-xs rounded-md border border-[#232329] text-[#a1a1aa] hover:text-white hover:border-[#3f3f46]"
            aria-label="Refresh treasury balance from chain"
          >
            Refresh balance
          </button>
          <button
            type="button"
            onClick={reset}
            className="px-3 py-1.5 text-xs rounded-md border border-[#232329] text-[#a1a1aa] hover:text-white hover:border-[#3f3f46]"
          >
            Reset form
          </button>
        </div>

        {step === 'form' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              goReview();
            }}
          >
            <div>
              <label htmlFor={`${formId}-recipient`} className="block text-xs text-[#a1a1aa] mb-1">
                Recipient address
              </label>
              <input
                id={`${formId}-recipient`}
                name="recipient"
                autoComplete="off"
                spellCheck={false}
                value={draft.recipient}
                onChange={(e) => setDraft({ recipient: e.target.value.trim() })}
                disabled={blocked}
                placeholder="0x…"
                className="w-full rounded-lg bg-[#121216] border border-[#232329] px-3 py-2 text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:ring-2 focus:ring-[#5b5bf6]"
                aria-invalid={validation.errors.some((x) => x.startsWith('Recipient'))}
                aria-describedby={`${formId}-errors`}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-amount`} className="block text-xs text-[#a1a1aa] mb-1">
                Amount (wei)
              </label>
              <input
                id={`${formId}-amount`}
                name="amountWei"
                inputMode="numeric"
                value={draft.amountWei}
                onChange={(e) => setDraft({ amountWei: e.target.value.replace(/[^\d]/g, '') })}
                disabled={blocked}
                placeholder="0"
                className="w-full rounded-lg bg-[#121216] border border-[#232329] px-3 py-2 text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:ring-2 focus:ring-[#5b5bf6]"
                aria-invalid={validation.errors.some((x) => x.startsWith('Amount'))}
              />
              <p className="text-[11px] text-[#71717a] mt-1">{formatWei(draft.amountWei || undefined)}</p>
            </div>
            <div>
              <label htmlFor={`${formId}-reason`} className="block text-xs text-[#a1a1aa] mb-1">
                Reason (local note only)
              </label>
              <input
                id={`${formId}-reason`}
                name="reason"
                value={draft.reason ?? ''}
                onChange={(e) => setDraft({ reason: e.target.value })}
                disabled={blocked}
                className="w-full rounded-lg bg-[#121216] border border-[#232329] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#5b5bf6]"
              />
            </div>
            <button
              type="submit"
              disabled={blocked || !validation.ok}
              className="w-full sm:w-auto px-5 py-2 rounded-lg text-sm font-semibold bg-[#5b5bf6] text-white disabled:bg-[#232329] disabled:text-[#71717a] disabled:cursor-not-allowed"
            >
              Review withdrawal
            </button>
          </form>
        )}

        {step === 'review' && (
          <div className="space-y-4" data-testid="treasury-review">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[#a1a1aa] text-xs">Recipient</dt>
                <dd className="text-white font-mono break-all">{draft.recipient}</dd>
              </div>
              <div>
                <dt className="text-[#a1a1aa] text-xs">Amount</dt>
                <dd className="text-white">
                  {formatWei(draft.amountWei)} ({draft.amountWei} wei)
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={goBack}
                className="px-4 py-2 rounded-lg text-sm border border-[#232329] text-[#a1a1aa]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={goTypedConfirm}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#5b5bf6] text-white"
              >
                Continue to typed confirm
              </button>
            </div>
          </div>
        )}

        {step === 'typed_confirm' && (
          <div className="space-y-4" data-testid="treasury-typed-confirm">
            <label htmlFor={`${formId}-confirm`} className="block text-xs text-[#a1a1aa]">
              Type <span className="font-semibold text-white">{TREASURY_TYPED_CONFIRM_PHRASE}</span> to
              confirm
            </label>
            <input
              id={`${formId}-confirm`}
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              className="w-full rounded-lg bg-[#121216] border border-[#232329] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#5b5bf6]"
              aria-required="true"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={goBack}
                className="px-4 py-2 rounded-lg text-sm border border-[#232329] text-[#a1a1aa]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void simulate()}
                disabled={!validation.ok}
                className="px-4 py-2 rounded-lg text-sm border border-[#3f3f46] text-white disabled:opacity-40"
              >
                Simulate
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!validation.ok || simulation?.success !== true}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white disabled:bg-[#232329] disabled:text-[#71717a]"
              >
                Submit withdrawal
              </button>
            </div>
            {simulation && (
              <p className="text-xs text-[#a1a1aa]" data-testid="treasury-simulation">
                {simulation.success
                  ? `Simulation ok. Gas estimate: ${simulation.gasEstimate ?? 'n/a'}`
                  : `Simulation failed: ${simulation.error}`}
              </p>
            )}
          </div>
        )}

        {(step === 'submit' || receipt.txHash || receipt.error) && (
          <div className="text-xs space-y-1" data-testid="treasury-receipt">
            {receipt.txHash ? (
              <a
                href={getTransactionExplorerUrl(receipt.txHash, receipt.chainId ?? undefined)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-[#5b5bf6]"
                aria-label="View treasury withdrawal on explorer"
              >
                View on Explorer ({receipt.txHash.slice(0, 10)}…{receipt.txHash.slice(-6)})
              </a>
            ) : (
              <p className="text-[#71717a]">No transaction hash yet (nothing fabricated).</p>
            )}
            {receipt.confirmations != null && (
              <p className="text-[#a1a1aa]">Confirmations: {receipt.confirmations}</p>
            )}
          </div>
        )}

        {validation.errors.length > 0 && step !== 'submit' && (
          <ul id={`${formId}-errors`} className="text-xs text-red-300 list-disc pl-5 space-y-1">
            {validation.errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        )}
        {validation.warnings.length > 0 && (
          <ul className="text-xs text-amber-200 list-disc pl-5 space-y-1">
            {validation.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
