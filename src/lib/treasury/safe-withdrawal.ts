/**
 * Pure Safe Treasury Withdrawal helpers (V2-FE-119).
 * Fail closed on integrity uncertainty; never fabricate calldata success.
 */

import { encodeFunctionData, isAddress, getAddress } from 'viem';
import { getAddressValidationError } from '@/lib/contracts/address-guard';
import { OPTIMISM_CHAIN_IDS } from '@/lib/transaction-machine/transaction-machine.types';
import type {
  TreasuryAccessGate,
  TreasuryBalanceSnapshot,
  TreasuryWithdrawalDraft,
  TreasuryWithdrawalValidation,
} from '@/app/types/treasury';
import { TREASURY_STALE_MS, TREASURY_TYPED_CONFIRM_PHRASE } from '@/app/types/treasury';

const WITHDRAW_FN = 'withdrawTreasury';
const BALANCE_FN = 'treasuryBalance';

export function abiHasFunction(abi: readonly unknown[], name: string): boolean {
  return abi.some(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry as { type?: string; name?: string }).type === 'function' &&
      (entry as { name?: string }).name === name,
  );
}

export function isSupportedTreasuryChain(chainId: number | null | undefined): boolean {
  if (chainId == null) return false;
  return (OPTIMISM_CHAIN_IDS as readonly number[]).includes(chainId);
}

export function normalizeAdminAddress(roles: Record<string, unknown> | null | undefined): `0x${string}` | null {
  const raw = roles?.admin;
  if (typeof raw !== 'string') return null;
  if (getAddressValidationError(raw)) return null;
  try {
    return getAddress(raw as `0x${string}`);
  } catch {
    return null;
  }
}

export function evaluateAccessGate(input: {
  walletAddress: `0x${string}` | null;
  chainId: number | null;
  abi: readonly unknown[];
  roles: Record<string, unknown> | null;
  contractAddress: string | null;
}): TreasuryAccessGate {
  const adminAddress = normalizeAdminAddress(input.roles);
  const walletConnected = Boolean(input.walletAddress);
  const chainSupported = isSupportedTreasuryChain(input.chainId);
  const abiSupportsWithdraw = abiHasFunction(input.abi, WITHDRAW_FN);
  const configComplete =
    Boolean(adminAddress) &&
    Boolean(input.contractAddress) &&
    getAddressValidationError(input.contractAddress) === null;

  let isAdmin = false;
  if (walletConnected && adminAddress && input.walletAddress) {
    isAdmin = input.walletAddress.toLowerCase() === adminAddress.toLowerCase();
  }

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
    walletAddress: input.walletAddress,
    isAdmin,
    chainSupported,
    chainId: input.chainId,
    abiSupportsWithdraw,
    configComplete,
    adminAddress,
    blockReason,
  };
}

export function markBalanceStaleness(
  snapshot: Omit<TreasuryBalanceSnapshot, 'isStale'>,
  nowMs: number = Date.now(),
): TreasuryBalanceSnapshot {
  const fetched = Date.parse(snapshot.fetchedAt);
  const isStale = !Number.isFinite(fetched) || nowMs - fetched > TREASURY_STALE_MS;
  return { ...snapshot, isStale };
}

export function validateWithdrawalDraft(
  draft: TreasuryWithdrawalDraft,
  balance: TreasuryBalanceSnapshot | null,
  typedConfirm?: string,
  requireTypedConfirm = false,
): TreasuryWithdrawalValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const recipientError = getAddressValidationError(draft.recipient);
  if (recipientError) {
    errors.push(`Recipient: ${recipientError}`);
  } else if (!isAddress(draft.recipient)) {
    errors.push('Recipient: invalid EVM address');
  }

  let amount: bigint | null = null;
  try {
    amount = BigInt(draft.amountWei);
  } catch {
    errors.push('Amount must be a non-negative integer wei string');
  }

  if (amount !== null) {
    if (amount <= 0n) {
      errors.push('Amount must be greater than zero');
    }
    if (balance) {
      let available: bigint;
      try {
        available = BigInt(balance.amountWei);
      } catch {
        errors.push('Treasury balance is not a valid integer — fail closed');
        available = 0n;
      }
      if (amount > available) {
        errors.push('Amount exceeds canonical treasury balance');
      }
      if (balance.isStale) {
        warnings.push('Treasury balance snapshot is stale — refresh before submitting');
      }
    } else {
      errors.push('Treasury balance unavailable — fail closed');
    }
  }

  if (requireTypedConfirm) {
    if ((typedConfirm ?? '').trim() !== TREASURY_TYPED_CONFIRM_PHRASE) {
      errors.push(`Type ${TREASURY_TYPED_CONFIRM_PHRASE} to confirm this irreversible withdrawal`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function encodeWithdrawTreasuryCall(input: {
  abi: readonly unknown[];
  recipient: `0x${string}`;
  amountWei: string;
}): `0x${string}` {
  if (!abiHasFunction(input.abi, WITHDRAW_FN)) {
    throw new Error('withdrawTreasury missing from canonical ABI — fail closed');
  }
  return encodeFunctionData({
    abi: input.abi as never,
    functionName: WITHDRAW_FN,
    args: [getAddress(input.recipient), BigInt(input.amountWei)],
  });
}

export function abiHasTreasuryBalance(abi: readonly unknown[]): boolean {
  return abiHasFunction(abi, BALANCE_FN);
}

export { WITHDRAW_FN, BALANCE_FN };
