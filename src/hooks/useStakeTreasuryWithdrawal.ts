'use client';

/**
 * useStakeTreasuryWithdrawal — V2-FE-061
 *
 * Orchestrates the Stake & Treasury Withdrawal UX against canonical artifacts.
 *
 * - Reserved (stake) and unlocked (treasury) balances are canonical contract
 *   reads (`balanceOf`, `treasuryBalance`); a failed read yields null and the
 *   flow fails closed — no balance is ever invented.
 * - Recipient/asset rows are validated locally before any calldata is built.
 * - Each recipient is submitted and receipt-tracked independently, so one
 *   rejected/failed recipient is isolated and never masks the others.
 * - Success is derived only from a real wallet hash plus a canonical receipt.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';

import { getChainConfig, isSupportedChain } from '@/config/chains';
import {
  getContractAbi,
  getContractAddress,
  getProtocolRelease,
  getReleaseChainId,
} from '@/lib/contracts/registry';
import { clearPendingTransaction, trackPendingTransaction } from '@/lib/pending-transactions';
import { getCanonicalRoles } from '@/lib/treasury/protocol-roles';
import { normalizeAdminAddress } from '@/lib/treasury/safe-withdrawal';
import {
  classifyWithdrawalError,
  encodePullWithdrawalCall,
  evaluateStakeTreasuryGate,
  markBalanceViewStaleness,
  summarizeOutcomes,
  validateRecipients,
} from '@/lib/treasury/stake-withdrawal';
import type {
  RecipientOutcome,
  StakeTreasuryBalanceView,
  StakeTreasuryGate,
  StakeTreasuryRecipientRow,
  StakeTreasurySummary,
  StakeTreasuryUiStatus,
  StakeTreasuryValidation,
} from '@/app/types/stake-treasury';

export interface UseStakeTreasuryWithdrawalResult {
  status: StakeTreasuryUiStatus;
  gate: StakeTreasuryGate;
  balance: StakeTreasuryBalanceView | null;
  loadingBalance: boolean;
  recipients: StakeTreasuryRecipientRow[];
  validation: StakeTreasuryValidation;
  outcomes: RecipientOutcome[];
  summary: StakeTreasurySummary;
  refreshBalance: () => Promise<void>;
  addRecipient: () => void;
  updateRecipient: (id: string, patch: Partial<Omit<StakeTreasuryRecipientRow, 'id'>>) => void;
  removeRecipient: (id: string) => void;
  submit: () => Promise<void>;
  reset: () => void;
}

interface PublicClientLike {
  readContract?: (args: Record<string, unknown>) => Promise<unknown>;
  waitForTransactionReceipt?: (args: { hash: `0x${string}` }) => Promise<{
    status?: string;
    confirmations?: bigint | number;
  }>;
}

interface WalletClientLike {
  sendTransaction?: (args: {
    account: `0x${string}`;
    to: `0x${string}`;
    data: `0x${string}`;
    chain?: unknown;
  }) => Promise<`0x${string}`>;
}

let idCounter = 0;
function makeRowId(): string {
  idCounter += 1;
  return `recipient-${Date.now().toString(36)}-${idCounter}`;
}

function emptyRow(): StakeTreasuryRecipientRow {
  return { id: makeRowId(), recipient: '', amountWei: '', asset: 'native' };
}

function initialOutcome(row: StakeTreasuryRecipientRow, chainId: number | null): RecipientOutcome {
  return {
    id: row.id,
    recipient: row.recipient,
    amountWei: row.amountWei,
    status: 'idle',
    txHash: null,
    chainId,
    confirmations: null,
  };
}

export function useStakeTreasuryWithdrawal(): UseStakeTreasuryWithdrawalResult {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient() as PublicClientLike | undefined;
  const { data: walletClient } = useWalletClient();

  const abi = getContractAbi('TruthBountyWeighted');
  const contractAddress = getContractAddress('TruthBountyWeighted');
  const expectedChainId = getReleaseChainId();
  const adminAddress = useMemo(() => normalizeAdminAddress(getCanonicalRoles()), []);

  const gate = useMemo(
    () =>
      evaluateStakeTreasuryGate({
        walletAddress: (isConnected && address ? address : null) as `0x${string}` | null,
        chainId: chainId ?? null,
        abi,
        adminAddress,
        contractAddress,
      }),
    [isConnected, address, chainId, abi, adminAddress, contractAddress],
  );

  const [recipients, setRecipients] = useState<StakeTreasuryRecipientRow[]>([emptyRow()]);
  const [outcomes, setOutcomes] = useState<RecipientOutcome[]>([]);
  const [balance, setBalance] = useState<StakeTreasuryBalanceView | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusOverride, setStatusOverride] = useState<StakeTreasuryUiStatus | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const minBondWei = useMemo(() => {
    try {
      const params = getProtocolRelease().parameters as { minBondAmount?: unknown } | undefined;
      return typeof params?.minBondAmount === 'string' ? params.minBondAmount : null;
    } catch {
      return null;
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!publicClient || typeof publicClient.readContract !== 'function') {
      setBalance(null);
      return;
    }
    if (!gate.chainSupported) {
      setBalance(null);
      return;
    }

    setLoadingBalance(true);
    let reservedWei: string | null = null;
    let unlockedWei: string | null = null;

    try {
      if (address) {
        try {
          const raw = (await publicClient.readContract({
            address: contractAddress,
            abi: abi as never,
            functionName: 'balanceOf',
            args: [address],
          })) as bigint;
          reservedWei = raw.toString();
        } catch {
          reservedWei = null;
        }
      }
      try {
        const raw = (await publicClient.readContract({
          address: contractAddress,
          abi: abi as never,
          functionName: 'treasuryBalance',
        })) as bigint;
        unlockedWei = raw.toString();
      } catch {
        unlockedWei = null;
      }

      if (!mountedRef.current) return;
      if (reservedWei === null && unlockedWei === null) {
        setBalance(null);
      } else {
        setBalance(
          markBalanceViewStaleness({
            reservedWei,
            unlockedWei,
            minBondWei,
            fetchedAt: new Date().toISOString(),
            chainId: chainId ?? expectedChainId,
            contractAddress,
          }),
        );
      }
    } finally {
      if (mountedRef.current) setLoadingBalance(false);
    }
  }, [
    publicClient,
    gate.chainSupported,
    address,
    contractAddress,
    abi,
    chainId,
    expectedChainId,
    minBondWei,
  ]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  // Recompute staleness over time without inventing a new balance.
  useEffect(() => {
    const id = window.setInterval(() => {
      setBalance((prev) =>
        prev
          ? markBalanceViewStaleness({
              reservedWei: prev.reservedWei,
              unlockedWei: prev.unlockedWei,
              minBondWei: prev.minBondWei,
              fetchedAt: prev.fetchedAt,
              chainId: prev.chainId,
              contractAddress: prev.contractAddress,
            })
          : prev,
      );
    }, 5_000);
    return () => window.clearInterval(id);
  }, [balance?.fetchedAt]);

  const validation = useMemo(() => validateRecipients(recipients, balance), [recipients, balance]);

  const summary = useMemo(() => summarizeOutcomes(outcomes), [outcomes]);

  const status: StakeTreasuryUiStatus = useMemo(() => {
    if (submitting) return 'submitting';
    if (
      statusOverride &&
      [
        'rejected',
        'failed',
        'pending',
        'confirmed',
        'finalized',
        'partial',
        'unauthorized',
      ].includes(statusOverride)
    ) {
      return statusOverride;
    }
    if (gate.blockReason) {
      if (!gate.configComplete || !gate.abiSupportsWithdraw) return 'missing_config';
      if (!gate.walletConnected) return 'empty';
      if (!gate.chainSupported) return 'unsupported_chain';
      if (!gate.isAdmin) return 'unauthorized';
    }
    if (loadingBalance) return 'loading';
    if (!balance) return 'empty';
    if (balance.isStale) return 'stale';
    return 'ready';
  }, [submitting, statusOverride, gate, loadingBalance, balance]);

  const addRecipient = useCallback(() => {
    setRecipients((prev) => [...prev, emptyRow()]);
    setStatusOverride(null);
  }, []);

  const updateRecipient = useCallback(
    (id: string, patch: Partial<Omit<StakeTreasuryRecipientRow, 'id'>>) => {
      setRecipients((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
      setStatusOverride(null);
    },
    [],
  );

  const removeRecipient = useCallback((id: string) => {
    setRecipients((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
  }, []);

  const submit = useCallback(async () => {
    if (gate.blockReason) {
      setStatusOverride(gate.isAdmin === false ? 'unauthorized' : 'failed');
      return;
    }
    const currentValidation = validateRecipients(recipients, balance);
    if (!currentValidation.ok) {
      setStatusOverride('failed');
      return;
    }

    const wallet = walletClient as WalletClientLike | undefined;
    if (!wallet || typeof wallet.sendTransaction !== 'function' || !address) {
      setStatusOverride('failed');
      return;
    }

    const finalizedBlocks = isSupportedChain(chainId) ? getChainConfig(chainId).finalizedBlocks : 0;

    const next = new Map<string, RecipientOutcome>();
    recipients.forEach((row) => next.set(row.id, initialOutcome(row, chainId ?? expectedChainId)));
    const flush = () => setOutcomes(Array.from(next.values()));

    setSubmitting(true);
    setStatusOverride('pending');
    flush();

    for (const row of recipients) {
      const outcome = next.get(row.id);
      if (!outcome) continue;

      const pendingId = `stake-treasury:${row.id}:${row.recipient}:${row.amountWei}`;
      outcome.status = 'awaiting_signature';
      flush();
      trackPendingTransaction({
        id: pendingId,
        kind: 'treasury',
        title: 'Treasury withdrawal pending',
        description: `Withdrawing ${row.amountWei} wei to ${row.recipient}`,
        txHash: null,
        chainId: chainId ?? expectedChainId,
        machineState: 'signature-requested',
      });

      try {
        const data = encodePullWithdrawalCall({
          abi,
          recipient: row.recipient as `0x${string}`,
          amountWei: row.amountWei,
        });

        const hash = await wallet.sendTransaction({
          account: address as `0x${string}`,
          to: contractAddress,
          data,
          chain: undefined,
        });

        outcome.status = 'submitted';
        outcome.txHash = hash;
        outcome.chainId = chainId ?? expectedChainId;
        outcome.confirmations = 0;
        outcome.submittedAt = new Date().toISOString();
        flush();

        trackPendingTransaction({
          id: pendingId,
          kind: 'treasury',
          title: 'Treasury withdrawal pending',
          description: `Withdrawing ${row.amountWei} wei to ${row.recipient}`,
          txHash: hash,
          chainId: chainId ?? expectedChainId,
          machineState: 'submitted',
        });

        if (publicClient && typeof publicClient.waitForTransactionReceipt === 'function') {
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          const confirmations = Number(receipt.confirmations ?? 1);
          if (receipt.status === 'reverted') {
            outcome.status = 'failed';
            outcome.error = 'Transaction reverted on-chain';
          } else {
            const finalized = finalizedBlocks > 0 && confirmations >= finalizedBlocks;
            outcome.status = finalized ? 'finalized' : 'confirmed';
            outcome.confirmations = confirmations;
            if (finalized) outcome.finalizedAt = new Date().toISOString();
          }
        }
        clearPendingTransaction(pendingId);
      } catch (error) {
        clearPendingTransaction(pendingId);
        const classified = classifyWithdrawalError(error);
        outcome.status = classified.status;
        outcome.error = classified.message;
      }
      flush();
    }

    if (!mountedRef.current) return;
    setSubmitting(false);

    const finalSummary = summarizeOutcomes(Array.from(next.values()));
    if (finalSummary.partial) setStatusOverride('partial');
    else if (finalSummary.confirmed > 0) setStatusOverride('confirmed');
    else if (finalSummary.rejected > 0) setStatusOverride('rejected');
    else setStatusOverride('failed');

    await refreshBalance();
  }, [
    gate,
    recipients,
    balance,
    walletClient,
    address,
    chainId,
    expectedChainId,
    abi,
    contractAddress,
    publicClient,
    refreshBalance,
  ]);

  const reset = useCallback(() => {
    setRecipients([emptyRow()]);
    setOutcomes([]);
    setStatusOverride(null);
  }, []);

  return {
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
  };
}

export default useStakeTreasuryWithdrawal;
