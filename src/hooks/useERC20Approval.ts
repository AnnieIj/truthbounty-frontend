'use client';

/**
 * V2-FE-016 — ERC-20 Approval State Machine
 *
 * Manages the full lifecycle of an ERC-20 `approve()` call:
 *   1. Reads current allowance via useERC20Allowance.
 *   2. Computes whether approval is needed (exact policy) or should be reset
 *      (reset policy: send approve(0) first on chains/tokens that require it).
 *   3. Submits `approve()` via wagmi useWriteContract.
 *   4. Waits for the confirmed on-chain receipt via useWaitForTransactionReceipt.
 *   5. Triggers an allowance refresh from the receipt — NOT from a timer.
 *
 * State distinction:
 *   - Approval state (this hook) is entirely separate from protocol execution
 *     state (useEvmTransaction / useTransactionMachine). Callers must gate
 *     protocol calls behind `approvalStatus === 'approved'`.
 *
 * Security invariants:
 *  - txHash is NEVER fabricated; only wagmi-returned values are accepted.
 *  - chainId is validated before any write is issued.
 *  - Fails closed on unsupported chain, invalid address, or zero required amount.
 *  - No Stellar/Freighter/simulator runtime dependencies.
 *  - `approve(address, 0)` reset is explicit and only issued when policy = 'reset'.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseAbi, isAddress } from 'viem';
import { isSupportedChain } from '@/config/wagmi';
import { useERC20Allowance } from './useERC20Allowance';

// ---------------------------------------------------------------------------
// ABI — ERC-20 approve (write)
// ---------------------------------------------------------------------------

export const ERC20_APPROVE_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Policy for how approval amount is handled.
 * - 'exact': approve exactly `requiredAmount`. No reset tx. Default.
 * - 'reset': first approve(spender, 0), then approve(spender, requiredAmount).
 *   Required by some non-standard tokens (e.g. USDT on mainnet). Use this
 *   only when the target token is known to require it.
 */
export type ApprovalPolicy = 'exact' | 'reset';

export type ApprovalStatus =
  | 'idle'              // hook not yet configured or no action needed yet
  | 'unsupported-chain' // chain validation failed — fail closed
  | 'invalid-params'    // address or amount validation failed
  | 'checking'          // reading current allowance from chain
  | 'approved'          // current allowance >= requiredAmount — no tx needed
  | 'needs-approval'    // current allowance < requiredAmount — tx needed
  | 'awaiting-signature'// wallet popup is open
  | 'pending-reset'     // reset tx (approve 0) is broadcast, awaiting receipt
  | 'pending-approval'  // approve tx is broadcast, awaiting receipt
  | 'confirming'        // receipt received, refreshing allowance
  | 'success'           // receipt confirmed and allowance >= requiredAmount
  | 'rejected'          // user rejected signature
  | 'error';            // RPC or contract error

export interface UseERC20ApprovalParams {
  /** ERC-20 token contract address. */
  tokenAddress: `0x${string}` | undefined;
  /** Spender contract address (e.g. TruthBountyWeighted). */
  spender: `0x${string}` | undefined;
  /** Exact amount the spender must be allowed to transfer. */
  requiredAmount: bigint | undefined;
  /**
   * Approval policy. Default: 'exact'.
   * Use 'reset' for tokens (e.g. USDT) that require approve(0) before re-approval.
   */
  policy?: ApprovalPolicy;
  /**
   * If true, the hook immediately checks allowance and returns 'approved' or
   * 'needs-approval'. If false, stays 'idle' until `approve()` is called.
   * Default: true.
   */
  autoCheck?: boolean;
}

export interface UseERC20ApprovalResult {
  /** Discriminated status. */
  status: ApprovalStatus;
  /** Current allowance in wei, if known. */
  allowance: bigint | undefined;
  /** Whether current allowance satisfies the required amount. */
  isSufficient: boolean;
  /** Whether approval tx is in-flight (either reset or approve). */
  isApproving: boolean;
  /** Last error, if any. */
  error: Error | null;
  /**
   * Submit the approval transaction(s).
   * No-op if status === 'approved' already.
   * Throws if params are invalid or chain is unsupported.
   */
  approve: () => Promise<void>;
  /** Reset to idle (for retry after error/rejection). */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class ERC20ApprovalError extends Error {
  readonly reason: ERC20ApprovalErrorReason;
  constructor(reason: ERC20ApprovalErrorReason, detail?: string) {
    super(`[ERC20Approval] ${reason}${detail ? `: ${detail}` : ''}`);
    this.name = 'ERC20ApprovalError';
    this.reason = reason;
  }
}

export type ERC20ApprovalErrorReason =
  | 'UNSUPPORTED_CHAIN'
  | 'INVALID_PARAMS'
  | 'WALLET_NOT_CONNECTED'
  | 'USER_REJECTED'
  | 'RESET_FAILED'
  | 'APPROVAL_FAILED'
  | 'RECEIPT_REVERTED'
  | 'UNEXPECTED';

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useERC20Approval({
  tokenAddress,
  spender,
  requiredAmount,
  policy = 'exact',
  autoCheck = true,
}: UseERC20ApprovalParams): UseERC20ApprovalResult {
  const { address: walletAddress, isConnected } = useAccount();
  const connectedChainId = useChainId();

  // ---------------------------------------------------------------------------
  // Internal state machine
  // ---------------------------------------------------------------------------

  const [status, setStatus] = useState<ApprovalStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Track the hash of the in-flight reset tx (approve 0)
  const [resetTxHash, setResetTxHash] = useState<`0x${string}` | undefined>(undefined);
  // Track the hash of the in-flight approval tx
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>(undefined);

  // Prevent duplicate submissions
  const isSubmitting = useRef(false);

  // ---------------------------------------------------------------------------
  // Param validation
  // ---------------------------------------------------------------------------

  const chainSupported =
    connectedChainId !== undefined && isSupportedChain(connectedChainId);

  // Params are "absent" (undefined/zero) vs "invalid" (present but malformed)
  const paramsAbsent = !tokenAddress || !spender || requiredAmount === undefined;
  const paramsInvalid =
    !paramsAbsent &&
    (requiredAmount === 0n ||
      !isAddress(tokenAddress!) ||
      !isAddress(spender!));
  const paramsValid = !paramsAbsent && !paramsInvalid;

  // ---------------------------------------------------------------------------
  // Allowance read (drives 'checking' → 'approved'/'needs-approval')
  // ---------------------------------------------------------------------------

  const {
    status: allowanceStatus,
    allowance,
    refetch: refetchAllowance,
  } = useERC20Allowance({
    tokenAddress,
    owner: walletAddress,
    spender,
    chainId: connectedChainId,
    // No polling — receipt confirmation triggers refresh
    refetchInterval: 0,
  });

  const isSufficient =
    allowance !== undefined &&
    requiredAmount !== undefined &&
    allowance >= requiredAmount;

  // ---------------------------------------------------------------------------
  // Wagmi write hook
  // ---------------------------------------------------------------------------

  const { writeContractAsync } = useWriteContract();

  // ---------------------------------------------------------------------------
  // Receipt watchers — one for reset tx, one for approve tx
  // ---------------------------------------------------------------------------

  const resetReceiptQuery = useWaitForTransactionReceipt({
    hash: resetTxHash,
    query: { enabled: !!resetTxHash },
  });

  const approveReceiptQuery = useWaitForTransactionReceipt({
    hash: approveTxHash,
    query: { enabled: !!approveTxHash },
  });

  // ---------------------------------------------------------------------------
  // React to allowance-read results when autoCheck = true
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!autoCheck) return;
    // Only act when we're in a state that should react to fresh allowance data
    if (
      status !== 'idle' &&
      status !== 'checking' &&
      status !== 'needs-approval' &&
      status !== 'approved'
    ) {
      return;
    }

    // Absent params → idle (not yet configured)
    if (paramsAbsent) {
      if (status !== 'idle') setStatus('idle');
      return;
    }

    // Invalid params → invalid-params (present but malformed)
    if (paramsInvalid) {
      setStatus('invalid-params');
      return;
    }

    if (!chainSupported) {
      setStatus('unsupported-chain');
      return;
    }

    if (allowanceStatus === 'loading') {
      setStatus('checking');
    } else if (allowanceStatus === 'success') {
      setStatus(isSufficient ? 'approved' : 'needs-approval');
    } else if (allowanceStatus === 'error') {
      setStatus('error');
    }
  }, [
    autoCheck,
    chainSupported,
    paramsAbsent,
    paramsInvalid,
    allowanceStatus,
    isSufficient,
    status,
  ]);

  // ---------------------------------------------------------------------------
  // submitApproval (internal — submits the approve(spender, requiredAmount) tx)
  // ---------------------------------------------------------------------------

  const submitApproval = useCallback(async () => {
    if (!tokenAddress || !spender || requiredAmount === undefined) return;

    try {
      setStatus('awaiting-signature');
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [spender, requiredAmount],
      });
      setApproveTxHash(hash);
      setStatus('pending-approval');
    } catch (err: unknown) {
      isSubmitting.current = false;
      const isUserRejection =
        err instanceof Error &&
        (err.message.includes('User rejected') ||
          err.message.includes('user rejected') ||
          err.message.includes('4001'));

      if (isUserRejection) {
        setError(new ERC20ApprovalError('USER_REJECTED', 'User rejected the approval request'));
        setStatus('rejected');
      } else {
        setError(
          err instanceof Error
            ? err
            : new ERC20ApprovalError('UNEXPECTED', String(err)),
        );
        setStatus('error');
      }
    }
  }, [tokenAddress, spender, requiredAmount, writeContractAsync]);

  // ---------------------------------------------------------------------------
  // React to reset tx receipt
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const receipt = resetReceiptQuery.data;
    if (!receipt || status !== 'pending-reset') return;

    if (receipt.status === 'reverted') {
      setResetTxHash(undefined);
      const err = new ERC20ApprovalError('RESET_FAILED', 'Reset approval transaction reverted');
      setError(err);
      setStatus('error');
      isSubmitting.current = false;
      return;
    }

    // Reset confirmed — proceed to submit the real approval
    setResetTxHash(undefined);
    void submitApproval();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetReceiptQuery.data, status]);

  // ---------------------------------------------------------------------------
  // React to approve tx receipt
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const receipt = approveReceiptQuery.data;
    if (!receipt || status !== 'pending-approval') return;

    if (receipt.status === 'reverted') {
      setApproveTxHash(undefined);
      const err = new ERC20ApprovalError('APPROVAL_FAILED', 'Approval transaction reverted');
      setError(err);
      setStatus('error');
      isSubmitting.current = false;
      return;
    }

    // Receipt confirmed — refresh allowance from chain
    setApproveTxHash(undefined);
    setStatus('confirming');
    refetchAllowance();
    isSubmitting.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceiptQuery.data, status]);

  // ---------------------------------------------------------------------------
  // React to allowance refresh after confirmation
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (status !== 'confirming') return;
    if (allowanceStatus === 'loading') return; // still fetching

    if (allowanceStatus === 'success') {
      setStatus(isSufficient ? 'success' : 'error');
      if (!isSufficient) {
        setError(new ERC20ApprovalError('APPROVAL_FAILED', 'Allowance still insufficient after confirmation'));
      }
    } else if (allowanceStatus === 'error') {
      setStatus('error');
    }
  }, [status, allowanceStatus, isSufficient]);

  // ---------------------------------------------------------------------------
  // Public `approve()` method
  // ---------------------------------------------------------------------------

  const approve = useCallback(async (): Promise<void> => {
    // Already approved — nothing to do
    if (isSufficient && status === 'approved') return;

    // Guard: fail closed on bad state
    if (!chainSupported) {
      throw new ERC20ApprovalError('UNSUPPORTED_CHAIN', `Chain ${connectedChainId} is not supported`);
    }
    if (paramsAbsent || paramsInvalid) {
      throw new ERC20ApprovalError('INVALID_PARAMS', 'tokenAddress, spender, or requiredAmount is invalid');
    }
    if (!isConnected || !walletAddress) {
      throw new ERC20ApprovalError('WALLET_NOT_CONNECTED', 'Wallet not connected');
    }
    if (isSubmitting.current) return;

    isSubmitting.current = true;
    setError(null);

    if (policy === 'reset') {
      // Step 1: reset to zero
      try {
        setStatus('awaiting-signature');
        const resetHash = await writeContractAsync({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_APPROVE_ABI,
          functionName: 'approve',
          args: [spender as `0x${string}`, 0n],
        });
        setResetTxHash(resetHash);
        setStatus('pending-reset');
        // submitApproval() will be called after resetReceipt confirms (see effect above)
      } catch (err: unknown) {
        isSubmitting.current = false;
        const isUserRejection =
          err instanceof Error &&
          (err.message.includes('User rejected') ||
            err.message.includes('user rejected') ||
            err.message.includes('4001'));

        if (isUserRejection) {
          setError(new ERC20ApprovalError('USER_REJECTED', 'User rejected the reset approval request'));
          setStatus('rejected');
        } else {
          setError(
            err instanceof Error
              ? err
              : new ERC20ApprovalError('UNEXPECTED', String(err)),
          );
          setStatus('error');
        }
      }
    } else {
      // 'exact' policy — single approve call
      await submitApproval();
    }
  }, [
    isSufficient,
    status,
    chainSupported,
    paramsAbsent,
    paramsInvalid,
    isConnected,
    walletAddress,
    connectedChainId,
    policy,
    tokenAddress,
    spender,
    writeContractAsync,
    submitApproval,
  ]);

  // ---------------------------------------------------------------------------
  // Public `reset()` — return to idle for retry
  // ---------------------------------------------------------------------------

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setResetTxHash(undefined);
    setApproveTxHash(undefined);
    isSubmitting.current = false;
  }, []);

  // ---------------------------------------------------------------------------
  // Derived flags
  // ---------------------------------------------------------------------------

  const isApproving =
    status === 'awaiting-signature' ||
    status === 'pending-reset' ||
    status === 'pending-approval' ||
    status === 'confirming';

  return {
    status,
    allowance,
    isSufficient,
    isApproving,
    error,
    approve,
    reset,
  };
}
