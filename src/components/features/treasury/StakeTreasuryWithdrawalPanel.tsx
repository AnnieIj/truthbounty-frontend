'use client';

/**
 * StakeTreasuryWithdrawalPanel — V2-FE-061
 *
 * Fail-closed Stake & Treasury Withdrawal UX: shows reserved (stake) vs
 * unlocked (treasury) canonical balances, validates recipient/asset rows, and
 * submits each recipient independently so a failed row is isolated. Success is
 * only ever shown from a real hash + canonical receipt.
 */

import React, { useId } from 'react';
import { formatEther } from 'viem';

import { useStakeTreasuryWithdrawal } from '@/hooks/useStakeTreasuryWithdrawal';
import { getTransactionExplorerUrl } from '@/lib/explorer';
import { isSupportedWithdrawalAsset } from '@/lib/treasury/stake-withdrawal';
import {
  NATIVE_ASSET_LABEL,
  SUPPORTED_WITHDRAWAL_ASSETS,
  type RecipientOutcome,
  type StakeTreasuryAsset,
  type StakeTreasuryRecipientRow,
} from '@/app/types/stake-treasury';

function formatWei(wei: string | null | undefined): string {
  if (wei === null || wei === undefined || wei === '') return '—';
  try {
    return `${formatEther(BigInt(wei))} ETH`;
  } catch {
    return `${wei} wei`;
  }
}

function StatusBanner({ status, message }: { status: string; message: string }) {
  const tone =
    status === 'confirmed' || status === 'finalized'
      ? 'border-green-900/40 bg-green-900/15 text-green-300'
      : status === 'failed' ||
          status === 'rejected' ||
          status === 'unauthorized' ||
          status === 'partial'
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
      data-testid="stake-treasury-status-banner"
      data-status={status}
    >
      {message}
    </div>
  );
}

function outcomeTone(status: RecipientOutcome['status']): string {
  switch (status) {
    case 'confirmed':
    case 'finalized':
      return 'text-green-300';
    case 'failed':
    case 'invalid':
    case 'rejected':
      return 'text-red-300';
    case 'submitted':
    case 'awaiting_signature':
      return 'text-amber-200';
    default:
      return 'text-[#a1a1aa]';
  }
}

function outcomeLabel(status: RecipientOutcome['status']): string {
  switch (status) {
    case 'awaiting_signature':
      return 'Awaiting signature';
    case 'submitted':
      return 'Submitted';
    case 'confirmed':
      return 'Confirmed';
    case 'finalized':
      return 'Finalized';
    case 'rejected':
      return 'Rejected';
    case 'failed':
      return 'Failed';
    case 'invalid':
      return 'Invalid';
    default:
      return 'Ready';
  }
}

export default function StakeTreasuryWithdrawalPanel() {
  const formId = useId();
  const {
    status,
    gate,
    balance,
    loadingBalance,
    recipients,
    validation,
    outcomes,
    summary,
    refreshBalance,
    addRecipient,
    updateRecipient,
    removeRecipient,
    submit,
    reset,
  } = useStakeTreasuryWithdrawal();

  const statusMessage = (() => {
    switch (status) {
      case 'loading':
        return 'Loading canonical stake and treasury balances…';
      case 'empty':
        return gate.blockReason || 'No canonical balances available yet.';
      case 'stale':
        return 'Balance snapshot is stale. Refresh before submitting.';
      case 'unauthorized':
        return gate.blockReason || 'Only the canonical treasury admin may withdraw.';
      case 'unsupported_chain':
        return gate.blockReason || 'Switch to Optimism Mainnet or OP Sepolia.';
      case 'missing_config':
        return gate.blockReason || 'Canonical configuration incomplete — fail closed.';
      case 'submitting':
        return 'Submitting withdrawals. Each recipient is tracked independently.';
      case 'partial':
        return 'Some recipients succeeded and others failed. Review each outcome below.';
      case 'rejected':
        return 'One or more recipients were rejected in your wallet.';
      case 'pending':
        return 'Withdrawals submitted — awaiting confirmations. Outcome is not final yet.';
      case 'failed':
        return 'No withdrawal succeeded. No success is assumed.';
      case 'confirmed':
        return 'Withdrawal(s) confirmed on-chain. Waiting for deeper finality where applicable.';
      case 'finalized':
        return 'Withdrawal(s) finalized. Balances refreshed from chain.';
      default:
        return gate.isAdmin
          ? 'Ready. Add recipients, then submit. Success is never shown without a real receipt.'
          : 'Connect as the canonical admin on Optimism to withdraw.';
    }
  })();

  const blocked = Boolean(gate.blockReason);
  const submitDisabled = blocked || !validation.ok || status === 'submitting';

  return (
    <section
      className="bg-[#18181b] rounded-xl border border-[#232329] overflow-hidden"
      aria-labelledby={`${formId}-title`}
      data-testid="stake-treasury-withdrawal-panel"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between px-6 py-4 border-b border-[#232329]">
        <div>
          <h2 id={`${formId}-title`} className="text-white font-semibold text-base">
            Stake &amp; Treasury Withdrawal
          </h2>
          <p className="text-[#a1a1aa] text-xs mt-1">
            Canonical Optimism/EVM reads and receipts only. Never fabricates balances or success.
          </p>
        </div>
        <dl className="text-left sm:text-right grid grid-cols-2 gap-x-6 gap-y-1">
          <div>
            <dt className="text-xs text-[#a1a1aa]">Reserved (stake)</dt>
            <dd className="text-lg font-semibold text-white" data-testid="stake-reserved-balance">
              {formatWei(balance?.reservedWei)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#a1a1aa]">Unlocked (treasury)</dt>
            <dd className="text-lg font-semibold text-white" data-testid="treasury-unlocked-balance">
              {formatWei(balance?.unlockedWei)}
            </dd>
          </div>
        </dl>
      </header>

      <div className="px-6 py-4 space-y-4">
        <StatusBanner status={status} message={statusMessage} />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshBalance()}
            disabled={loadingBalance}
            className="px-3 py-1.5 text-xs rounded-md border border-[#232329] text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] disabled:opacity-40"
            aria-label="Refresh stake and treasury balances from chain"
          >
            Refresh balances
          </button>
          <button
            type="button"
            onClick={reset}
            className="px-3 py-1.5 text-xs rounded-md border border-[#232329] text-[#a1a1aa] hover:text-white hover:border-[#3f3f46]"
          >
            Reset
          </button>
        </div>

        <fieldset className="space-y-4" disabled={blocked || status === 'submitting'}>
          <legend className="text-sm font-medium text-white">Recipients</legend>

          <ul className="space-y-3">
            {recipients.map((row: StakeTreasuryRecipientRow, index: number) => {
              const rowMessages = validation.rowErrors[row.id] ?? [];
              const addressId = `${formId}-recipient-${row.id}`;
              const amountId = `${formId}-amount-${row.id}`;
              const assetId = `${formId}-asset-${row.id}`;
              return (
                <li
                  key={row.id}
                  className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-start"
                  data-testid={`stake-treasury-row-${row.id}`}
                >
                  <div>
                    <label htmlFor={addressId} className="block text-xs text-[#a1a1aa] mb-1">
                      Recipient {index + 1} address
                    </label>
                    <input
                      id={addressId}
                      name={`recipient-${row.id}`}
                      autoComplete="off"
                      spellCheck={false}
                      value={row.recipient}
                      onChange={(e) => updateRecipient(row.id, { recipient: e.target.value.trim() })}
                      placeholder="0x…"
                      aria-invalid={rowMessages.some((m) => m.startsWith('Recipient'))}
                      aria-describedby={`${addressId}-error`}
                      className="w-full rounded-lg bg-[#121216] border border-[#232329] px-3 py-2 text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:ring-2 focus:ring-[#5b5bf6]"
                    />
                  </div>
                  <div>
                    <label htmlFor={amountId} className="block text-xs text-[#a1a1aa] mb-1">
                      Amount (wei)
                    </label>
                    <input
                      id={amountId}
                      name={`amount-${row.id}`}
                      inputMode="numeric"
                      value={row.amountWei}
                      onChange={(e) =>
                        updateRecipient(row.id, { amountWei: e.target.value.replace(/[^\d]/g, '') })
                      }
                      placeholder="0"
                      aria-invalid={rowMessages.some((m) => m.startsWith('Amount'))}
                      aria-describedby={`${amountId}-error`}
                      className="w-full rounded-lg bg-[#121216] border border-[#232329] px-3 py-2 text-sm text-white placeholder:text-[#52525b] focus:outline-none focus:ring-2 focus:ring-[#5b5bf6]"
                    />
                  </div>
                  <div>
                    <label htmlFor={assetId} className="block text-xs text-[#a1a1aa] mb-1">
                      Asset
                    </label>
                    <select
                      id={assetId}
                      name={`asset-${row.id}`}
                      value={row.asset}
                      onChange={(e) =>
                        updateRecipient(row.id, { asset: e.target.value as StakeTreasuryAsset })
                      }
                      className="w-full rounded-lg bg-[#121216] border border-[#232329] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#5b5bf6]"
                    >
                      {SUPPORTED_WITHDRAWAL_ASSETS.map((asset) => (
                        <option key={asset} value={asset}>
                          {isSupportedWithdrawalAsset(asset) ? NATIVE_ASSET_LABEL : asset}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="pt-5">
                    <button
                      type="button"
                      onClick={() => removeRecipient(row.id)}
                      disabled={recipients.length <= 1}
                      className="px-3 py-2 text-xs rounded-md border border-[#232329] text-[#a1a1aa] hover:text-white disabled:opacity-40"
                      aria-label={`Remove recipient ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                  {rowMessages.length > 0 && (
                    <ul
                      id={`${addressId}-error`}
                      className="sm:col-span-4 text-xs text-red-300 list-disc pl-5 space-y-1"
                    >
                      {rowMessages.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={addRecipient}
            className="px-3 py-1.5 text-xs rounded-md border border-[#232329] text-[#a1a1aa] hover:text-white hover:border-[#3f3f46]"
          >
            Add recipient
          </button>
        </fieldset>

        {validation.errors.length > 0 && (
          <ul className="text-xs text-red-300 list-disc pl-5 space-y-1" data-testid="stake-treasury-errors">
            {validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        {validation.warnings.length > 0 && (
          <ul className="text-xs text-amber-200 list-disc pl-5 space-y-1">
            {validation.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitDisabled}
          className="w-full sm:w-auto px-5 py-2 rounded-lg text-sm font-semibold bg-[#5b5bf6] text-white disabled:bg-[#232329] disabled:text-[#71717a] disabled:cursor-not-allowed"
          aria-describedby={`${formId}-submit-help`}
        >
          Submit withdrawals
        </button>
        <p id={`${formId}-submit-help`} className="text-[11px] text-[#71717a]">
          Each recipient is submitted and confirmed independently. A failed recipient is isolated
          and does not roll back the others.
        </p>

        {outcomes.length > 0 && (
          <div data-testid="stake-treasury-outcomes">
            <h3 className="text-sm font-medium text-white mb-2">Recipient outcomes</h3>
            <p className="text-xs text-[#a1a1aa] mb-2" data-testid="stake-treasury-summary">
              {summary.confirmed} confirmed · {summary.failed} failed · {summary.rejected} rejected ·{' '}
              {summary.pending} pending
            </p>
            <ul className="space-y-2">
              {outcomes.map((outcome) => (
                <li
                  key={outcome.id}
                  className="rounded-lg border border-[#232329] px-3 py-2 text-xs"
                  data-testid={`stake-treasury-outcome-${outcome.id}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-semibold ${outcomeTone(outcome.status)}`}>
                      {outcomeLabel(outcome.status)}
                    </span>
                    <span className="font-mono break-all text-[#a1a1aa]">{outcome.recipient}</span>
                    <span className="text-[#a1a1aa]">{formatWei(outcome.amountWei)}</span>
                  </div>
                  {outcome.txHash ? (
                    <a
                      href={getTransactionExplorerUrl(
                        outcome.txHash,
                        outcome.chainId ?? undefined,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-[#5b5bf6]"
                      aria-label={`View withdrawal for ${outcome.recipient} on explorer`}
                    >
                      View on Explorer ({outcome.txHash.slice(0, 10)}…{outcome.txHash.slice(-6)})
                    </a>
                  ) : (
                    <p className="text-[#71717a]">No transaction hash yet (nothing fabricated).</p>
                  )}
                  {outcome.confirmations != null && (
                    <p className="text-[#a1a1aa]">Confirmations: {outcome.confirmations}</p>
                  )}
                  {outcome.error && <p className="text-red-300">{outcome.error}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {gate.isAdmin === false && (
          <p className="text-[11px] text-[#71717a]" data-testid="stake-treasury-readonly-note">
            You can view canonical balances, but only the canonical treasury admin can withdraw.
          </p>
        )}
      </div>
    </section>
  );
}
