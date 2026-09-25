'use client';

/**
 * useSafeTreasuryWithdrawal — V2-FE-119
 *
 * Orchestrates Safe Treasury Withdrawal UX against canonical artifacts.
 * Never fabricates tx hashes, balances, or success. Fail closed on
 * unsupported chain, missing config, non-admin caller, or ABI gap.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import {
  getContractAbi,
  getContractAddress,
  getReleaseChainId,
} from '@/lib/contracts/registry';
import {
  abiHasTreasuryBalance,
  encodeWithdrawTreasuryCall,
  evaluateAccessGate,
  markBalanceStaleness,
  validateWithdrawalDraft,
} from '@/lib/treasury/safe-withdrawal';
import { getCanonicalRoles } from '@/lib/treasury/protocol-roles';
import type {
  TreasuryBalanceSnapshot,
  TreasuryWithdrawalDraft,
  TreasuryWithdrawalReceipt,
  TreasuryWithdrawalSimulation,
  TreasuryWithdrawalStep,
  TreasuryWithdrawalUiStatus,
  TreasuryWithdrawalValidation,
} from '@/app/types/treasury';
import {
  clearPendingTransaction,
  trackPendingTransaction,
} from '@/lib/pending-transactions';

const EMPTY_DRAFT: TreasuryWithdrawalDraft = {
  recipient: '',
  amountWei: '',
  reason: '',
};

export interface UseSafeTreasuryWithdrawalResult {
  status: TreasuryWithdrawalUiStatus;
  step: TreasuryWithdrawalStep;
  draft: TreasuryWithdrawalDraft;
  setDraft: (patch: Partial<TreasuryWithdrawalDraft>) => void;
  balance: TreasuryBalanceSnapshot | null;
  validation: TreasuryWithdrawalValidation;
  typedConfirm: string;
  setTypedConfirm: (value: string) => void;
  simulation: TreasuryWithdrawalSimulation | null;
  receipt: TreasuryWithdrawalReceipt;
  gateBlockReason: string | null;
  isAdmin: boolean;
  refreshBalance: () => Promise<void>;
  goReview: () => void;
  goTypedConfirm: () => void;
  goBack: () => void;
  simulate: () => Promise<TreasuryWithdrawalSimulation>;
  submit: () => Promise<void>;
  reset: () => void;
}

export function useSafeTreasuryWithdrawal(): UseSafeTreasuryWithdrawalResult {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const abi = getContractAbi('TruthBountyWeighted');
  const contractAddress = getContractAddress('TruthBountyWeighted');
  const roles = getCanonicalRoles();

  const gate = useMemo(
    () =>
      evaluateAccessGate({
        walletAddress: (isConnected && address ? address : null) as `0x${string}` | null,
        chainId: chainId ?? null,
        abi,
        roles,
        contractAddress,
      }),
    [isConnected, address, chainId, abi, roles, contractAddress],
  );

  const [draft, setDraftState] = useState<TreasuryWithdrawalDraft>(EMPTY_DRAFT);
  const [step, setStep] = useState<TreasuryWithdrawalStep>('form');
  const [typedConfirm, setTypedConfirm] = useState('');
  const [balance, setBalance] = useState<TreasuryBalanceSnapshot | null>(null);
  const [simulation, setSimulation] = useState<TreasuryWithdrawalSimulation | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [statusOverride, setStatusOverride] = useState<TreasuryWithdrawalUiStatus | null>(null);
  const [receipt, setReceipt] = useState<TreasuryWithdrawalReceipt>({
    txHash: null,
    chainId: null,
    status: 'idle',
    confirmations: null,
  });

  const setDraft = useCallback((patch: Partial<TreasuryWithdrawalDraft>) => {
    setDraftState((prev) => ({ ...prev, ...patch }));
    setSimulation(null);
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!gate.configComplete || !gate.abiSupportsWithdraw) {
      setBalance(null);
      return;
    }
    if (!publicClient || !gate.chainSupported) {
      setBalance(null);
      return;
    }

    setLoadingBalance(true);
    try {
      let amountWei: string;
      if (abiHasTreasuryBalance(abi)) {
        const raw = (await publicClient.readContract({
          address: contractAddress,
          abi: abi as never,
          functionName: 'treasuryBalance',
        })) as bigint;
        amountWei = raw.toString();
      } else {
        const raw = await publicClient.getBalance({ address: contractAddress });
        amountWei = raw.toString();
      }

      setBalance(
        markBalanceStaleness({
          amountWei,
          fetchedAt: new Date().toISOString(),
          chainId: chainId as number,
          contractAddress,
        }),
      );
    } catch (err) {
      setBalance(null);
      setStatusOverride('failed');
      setReceipt((prev) => ({
        ...prev,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Failed to read treasury balance',
      }));
    } finally {
      setLoadingBalance(false);
    }
  }, [gate, publicClient, abi, contractAddress, chainId]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  // Recompute staleness periodically without inventing new balances.
  useEffect(() => {
    if (!balance) return;
    const id = window.setInterval(() => {
      setBalance((prev) =>
        prev
          ? markBalanceStaleness({
              amountWei: prev.amountWei,
              fetchedAt: prev.fetchedAt,
              chainId: prev.chainId,
              contractAddress: prev.contractAddress,
            })
          : prev,
      );
    }, 5_000);
    return () => window.clearInterval(id);
  }, [balance?.fetchedAt]);

  const requireTyped = step === 'typed_confirm' || step === 'submit';
  const validation = useMemo(
    () => validateWithdrawalDraft(draft, balance, typedConfirm, requireTyped),
    [draft, balance, typedConfirm, requireTyped],
  );

  const status: TreasuryWithdrawalUiStatus = useMemo(() => {
    if (statusOverride && ['rejected', 'failed', 'pending', 'confirmed', 'finalized', 'reorged', 'awaiting_signature', 'simulating'].includes(statusOverride)) {
      return statusOverride;
    }
    if (gate.blockReason) {
      if (!gate.configComplete) return 'missing_config';
      if (!gate.abiSupportsWithdraw) return 'missing_config';
      if (!gate.walletConnected) return 'empty';
      if (!gate.chainSupported) return 'unsupported_chain';
      if (!gate.isAdmin) return 'unauthorized';
    }
    if (loadingBalance) return 'loading';
    if (!balance) return 'empty';
    if (balance.isStale) return 'stale';
    if (step === 'review') return 'review';
    if (step === 'typed_confirm') return 'confirming';
    if (BigInt(balance.amountWei || '0') === 0n) return 'empty';
    return 'ready';
  }, [statusOverride, gate, loadingBalance, balance, step]);

  const goReview = useCallback(() => {
    const v = validateWithdrawalDraft(draft, balance, '', false);
    if (!v.ok || gate.blockReason) return;
    setStep('review');
    setStatusOverride(null);
  }, [draft, balance, gate.blockReason]);

  const goTypedConfirm = useCallback(() => {
    const v = validateWithdrawalDraft(draft, balance, '', false);
    if (!v.ok || gate.blockReason) return;
    setStep('typed_confirm');
  }, [draft, balance, gate.blockReason]);

  const goBack = useCallback(() => {
    setSimulation(null);
    setTypedConfirm('');
    setStatusOverride(null);
    setStep((prev) => (prev === 'typed_confirm' ? 'review' : 'form'));
  }, []);

  const simulate = useCallback(async (): Promise<TreasuryWithdrawalSimulation> => {
    setStatusOverride('simulating');
    const v = validateWithdrawalDraft(draft, balance, typedConfirm, true);
    if (!v.ok || gate.blockReason || !address) {
      const result: TreasuryWithdrawalSimulation = {
        success: false,
        error: gate.blockReason || v.errors[0] || 'Validation failed — fail closed',
      };
      setSimulation(result);
      setStatusOverride('failed');
      return result;
    }

    try {
      const calldata = encodeWithdrawTreasuryCall({
        abi,
        recipient: draft.recipient as `0x${string}`,
        amountWei: draft.amountWei,
      });

      let gasEstimate = '180000';
      if (publicClient) {
        try {
          const gas = await publicClient.estimateGas({
            account: address,
            to: contractAddress,
            data: calldata,
          });
          gasEstimate = gas.toString();
        } catch (err) {
          const result: TreasuryWithdrawalSimulation = {
            success: false,
            error: err instanceof Error ? err.message : 'Simulation reverted — fail closed',
          };
          setSimulation(result);
          setStatusOverride('failed');
          return result;
        }
      }

      const result: TreasuryWithdrawalSimulation = {
        success: true,
        gasEstimate,
        calldata,
        from: address,
        to: contractAddress,
      };
      setSimulation(result);
      setStatusOverride('confirming');
      return result;
    } catch (err) {
      const result: TreasuryWithdrawalSimulation = {
        success: false,
        error: err instanceof Error ? err.message : 'Encoding failed — fail closed',
      };
      setSimulation(result);
      setStatusOverride('failed');
      return result;
    }
  }, [draft, balance, typedConfirm, gate.blockReason, address, abi, publicClient, contractAddress]);

  const submit = useCallback(async () => {
    if (gate.blockReason) {
      setStatusOverride('unauthorized');
      return;
    }
    const sim = simulation?.success ? simulation : await simulate();
    if (!sim.success || !sim.calldata || !walletClient || !address) {
      setStatusOverride(sim.error?.toLowerCase().includes('reject') ? 'rejected' : 'failed');
      setReceipt({
        txHash: null,
        chainId: chainId ?? null,
        status: 'failed',
        confirmations: null,
        error: sim.error || 'Cannot submit without successful simulation',
      });
      return;
    }

    const pendingId = `treasury-withdraw:${draft.recipient}:${draft.amountWei}`;
    trackPendingTransaction({
      id: pendingId,
      kind: 'treasury',
      title: 'Treasury withdrawal pending',
      description: `Withdrawing ${draft.amountWei} wei to ${draft.recipient}`,
      txHash: null,
      chainId: chainId ?? getReleaseChainId(),
      machineState: 'signature-requested',
    });

    setStatusOverride('awaiting_signature');
    setStep('submit');

    try {
      const txHash = await walletClient.sendTransaction({
        account: address,
        to: contractAddress,
        data: sim.calldata,
        chain: undefined,
      });

      // Real hash only — never fabricate.
      setReceipt({
        txHash,
        chainId: chainId ?? null,
        status: 'pending',
        confirmations: 0,
        submittedAt: new Date().toISOString(),
      });
      setStatusOverride('pending');

      trackPendingTransaction({
        id: pendingId,
        kind: 'treasury',
        title: 'Treasury withdrawal pending',
        description: `Withdrawing ${draft.amountWei} wei to ${draft.recipient}`,
        txHash,
        chainId: chainId ?? getReleaseChainId(),
        machineState: 'submitted',
      });

      if (publicClient) {
        const conf = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (conf.status === 'reverted') {
          clearPendingTransaction(pendingId);
          setReceipt({
            txHash,
            chainId: chainId ?? null,
            status: 'failed',
            confirmations: Number(conf.confirmations ?? 0),
            error: 'Transaction reverted on-chain',
            submittedAt: new Date().toISOString(),
          });
          setStatusOverride('failed');
          return;
        }

        const confirmations = Number(conf.confirmations ?? 1);
        setReceipt({
          txHash,
          chainId: chainId ?? null,
          status: confirmations >= 12 ? 'finalized' : 'confirmed',
          confirmations,
          submittedAt: new Date().toISOString(),
          finalizedAt: confirmations >= 12 ? new Date().toISOString() : undefined,
        });
        setStatusOverride(confirmations >= 12 ? 'finalized' : 'confirmed');
        clearPendingTransaction(pendingId);
        await refreshBalance();
      }
    } catch (err) {
      clearPendingTransaction(pendingId);
      const message = err instanceof Error ? err.message : 'Submission failed';
      const rejected =
        /user rejected|denied|rejected the request/i.test(message);
      setReceipt({
        txHash: null,
        chainId: chainId ?? null,
        status: rejected ? 'rejected' : 'failed',
        confirmations: null,
        error: message,
      });
      setStatusOverride(rejected ? 'rejected' : 'failed');
    }
  }, [
    gate.blockReason,
    simulation,
    simulate,
    walletClient,
    address,
    chainId,
    draft,
    contractAddress,
    publicClient,
    refreshBalance,
  ]);

  const reset = useCallback(() => {
    setDraftState(EMPTY_DRAFT);
    setStep('form');
    setTypedConfirm('');
    setSimulation(null);
    setStatusOverride(null);
    setReceipt({ txHash: null, chainId: null, status: 'idle', confirmations: null });
  }, []);

  return {
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
    gateBlockReason: gate.blockReason,
    isAdmin: gate.isAdmin,
    refreshBalance,
    goReview,
    goTypedConfirm,
    goBack,
    simulate,
    submit,
    reset,
  };
}
