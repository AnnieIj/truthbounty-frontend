/**
 * Pure Stake & Treasury Withdrawal helpers (V2-FE-061).
 *
 * These functions classify caller-supplied, canonical data only. They never
 * fabricate an address, amount, calldata, gas estimate, hash, or outcome, and
 * they fail closed on an unsupported chain/asset, a missing ABI entry, or an
 * unread balance.
 */

import { encodeFunctionData, getAddress } from 'viem';

import { getAddressValidationError } from '@/lib/contracts/address-guard';
import { abiHasFunction, isSupportedTreasuryChain } from '@/lib/treasury/safe-withdrawal';
import {
  NATIVE_ASSET_LABEL,
  STAKE_TREASURY_STALE_MS,
  SUPPORTED_WITHDRAWAL_ASSETS,
  type RecipientOutcome,
  type RecipientOutcomeStatus,
  type StakeTreasuryAsset,
  type StakeTreasuryBalanceView,
  type StakeTreasuryGate,
  type StakeTreasuryRecipientRow,
  type StakeTreasurySummary,
  type StakeTreasuryValidation,
} from '@/app/types/stake-treasury';

export const WITHDRAW_FN = 'withdrawTreasury';
export const BALANCE_OF_FN = 'balanceOf';
export const TREASURY_BALANCE_FN = 'treasuryBalance';

export function isSupportedWithdrawalAsset(asset: unknown): asset is StakeTreasuryAsset {
  return (SUPPORTED_WITHDRAWAL_ASSETS as readonly unknown[]).includes(asset);
}

export function assetLabel(asset: StakeTreasuryAsset): string {
  return asset === 'native' ? NATIVE_ASSET_LABEL : 'Unsupported asset';
}

export function markBalanceViewStaleness(
  snapshot: Omit<StakeTreasuryBalanceView, 'isStale'>,
  nowMs: number = Date.now(),
): StakeTreasuryBalanceView {
  const fetched = Date.parse(snapshot.fetchedAt);
  const isStale = !Number.isFinite(fetched) || nowMs - fetched > STAKE_TREASURY_STALE_MS;
  return { ...snapshot, isStale };
}

/**
 * Fail-closed gate for the withdrawal write path. A non-admin, unsupported
 * chain, incomplete canonical config, or an ABI without `withdrawTreasury`
 * blocks submission with a safe user-facing reason.
 */
export function evaluateStakeTreasuryGate(input: {
  walletAddress: `0x${string}` | null;
  chainId: number | null;
  abi: readonly unknown[];
  adminAddress: string | null;
  contractAddress: string | null;
}): StakeTreasuryGate {
  const walletConnected = Boolean(input.walletAddress);
  const chainSupported = isSupportedTreasuryChain(input.chainId);
  const abiSupportsWithdraw = abiHasFunction(input.abi, WITHDRAW_FN);
  const configComplete =
    Boolean(input.adminAddress) &&
    Boolean(input.contractAddress) &&
    getAddressValidationError(input.contractAddress) === null;
  const wallet = input.walletAddress;
  const admin = input.adminAddress;
  const isAdmin = Boolean(wallet && admin && wallet.toLowerCase() === admin.toLowerCase());

  let blockReason: string | null = null;
  if (!configComplete) {
    blockReason = 'Missing or invalid canonical treasury configuration — fail closed.';
  } else if (!abiSupportsWithdraw) {
    blockReason =
      'Canonical ABI does not expose withdrawTreasury — fail closed until artifacts include it.';
  } else if (!walletConnected) {
    blockReason = 'Connect an Optimism-compatible wallet to continue.';
  } else if (!chainSupported) {
    blockReason = 'Unsupported chain. Switch to Optimism Mainnet (10) or OP Sepolia (11155420).';
  } else if (!isAdmin) {
    blockReason = 'Connected wallet is not the canonical treasury admin — fail closed.';
  }

  return {
    walletConnected,
    chainSupported,
    configComplete,
    abiSupportsWithdraw,
    isAdmin,
    blockReason,
  };
}

function safeBigInt(value: string): bigint | null {
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Validate every recipient row and the aggregate against the canonical unlocked
 * balance. Errors are grouped per row (keyed by row id) plus global errors, so
 * a failed row can be isolated in the UI.
 */
export function validateRecipients(
  rows: StakeTreasuryRecipientRow[],
  balance: StakeTreasuryBalanceView | null,
): StakeTreasuryValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rowErrors: Record<string, string[]> = {};

  if (rows.length === 0) {
    errors.push('Add at least one recipient.');
  }

  const seen = new Set<string>();
  let total = 0n;
  let totalValid = true;

  for (const row of rows) {
    const messages: string[] = [];

    const recipientError = getAddressValidationError(row.recipient);
    if (recipientError) {
      messages.push(`Recipient: ${recipientError}`);
    } else {
      const normalized = row.recipient.trim().toLowerCase();
      if (seen.has(normalized)) {
        warnings.push(`Recipient ${row.recipient} appears more than once.`);
      }
      seen.add(normalized);
    }

    if (!isSupportedWithdrawalAsset(row.asset)) {
      messages.push('Unsupported asset — only the canonical native asset may be withdrawn.');
    }

    const amount = safeBigInt(row.amountWei);
    if (amount === null) {
      messages.push('Amount must be a non-negative integer wei string.');
    } else if (amount <= 0n) {
      messages.push('Amount must be greater than zero.');
    } else {
      total += amount;
    }

    if (messages.length > 0) {
      rowErrors[row.id] = messages;
      totalValid = false;
    }
  }

  if (!balance) {
    errors.push('Canonical treasury balance unavailable — fail closed.');
  } else {
    const unlocked = balance.unlockedWei === null ? null : safeBigInt(balance.unlockedWei);
    if (balance.unlockedWei !== null && unlocked === null) {
      errors.push('Canonical treasury balance is not a valid integer — fail closed.');
    } else if (unlocked !== null && totalValid && total > unlocked) {
      errors.push('Total amount exceeds the canonical treasury balance.');
    }
    if (balance.unlockedWei === null) {
      errors.push('Canonical treasury balance could not be read — fail closed.');
    }
    if (balance.isStale) {
      warnings.push('Balance snapshot is stale — refresh before submitting.');
    }
  }

  const rowErrorCount = Object.keys(rowErrors).length;
  const ok = errors.length === 0 && rowErrorCount === 0;
  return { ok, errors, rowErrors, warnings };
}

/** Encode the canonical `withdrawTreasury(to, amount)` call; fail closed if absent. */
export function encodePullWithdrawalCall(input: {
  abi: readonly unknown[];
  recipient: `0x${string}`;
  amountWei: string;
}): `0x${string}` {
  if (!abiHasFunction(input.abi, WITHDRAW_FN)) {
    throw new Error('withdrawTreasury missing from canonical ABI — fail closed');
  }
  const amount = safeBigInt(input.amountWei);
  if (amount === null || amount <= 0n) {
    throw new Error('Invalid withdrawal amount — fail closed');
  }
  const data = encodeFunctionData({
    abi: input.abi,
    functionName: WITHDRAW_FN,
    args: [getAddress(input.recipient), amount],
  } as never);
  return data as `0x${string}`;
}

/** Classify a wallet/RPC error into a safe per-recipient outcome. */
export function classifyWithdrawalError(error: unknown): {
  status: RecipientOutcomeStatus;
  message: string;
} {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : '';
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const haystack = `${name} ${raw}`.toLowerCase();

  if (haystack.includes('reject') || haystack.includes('denied')) {
    return { status: 'rejected', message: 'You rejected the transaction in your wallet.' };
  }
  if (haystack.includes('revert')) {
    return { status: 'failed', message: 'The withdrawal reverted on-chain.' };
  }
  return { status: 'failed', message: 'The withdrawal could not be submitted.' };
}

export function isTerminalOutcome(status: RecipientOutcomeStatus): boolean {
  return (
    status === 'confirmed' ||
    status === 'finalized' ||
    status === 'failed' ||
    status === 'rejected' ||
    status === 'invalid'
  );
}

/**
 * Aggregate per-recipient outcomes. Success is asserted only from terminal,
 * receipt-backed outcomes; a partially failed batch is reported as `partial`,
 * never as an unconditional success.
 */
export function summarizeOutcomes(outcomes: RecipientOutcome[]): StakeTreasurySummary {
  let confirmed = 0;
  let failed = 0;
  let rejected = 0;
  let pending = 0;

  for (const outcome of outcomes) {
    switch (outcome.status) {
      case 'confirmed':
      case 'finalized':
        confirmed += 1;
        break;
      case 'failed':
      case 'invalid':
        failed += 1;
        break;
      case 'rejected':
        rejected += 1;
        break;
      default:
        pending += 1;
    }
  }

  const allSettled = outcomes.every((outcome) => isTerminalOutcome(outcome.status));
  const anyIndeterminate = outcomes.some((outcome) => !isTerminalOutcome(outcome.status));

  return {
    total: outcomes.length,
    confirmed,
    failed,
    rejected,
    pending,
    allSettled,
    anyIndeterminate,
    partial: confirmed > 0 && failed + rejected > 0,
  };
}

export function hasUnlockedBalance(balance: StakeTreasuryBalanceView | null): boolean {
  if (!balance || balance.unlockedWei === null) return false;
  const value = safeBigInt(balance.unlockedWei);
  return value !== null && value > 0n;
}
