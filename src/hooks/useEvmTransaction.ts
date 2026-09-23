'use client';

/**
 * V2-FE-009 — Shared Transaction State Machine
 * useEvmTransaction — Wagmi/Viem adapter connecting real wallet interactions
 * to the shared transaction state machine.
 *
 * Security invariants:
 *  - txHash is NEVER fabricated; only Wagmi-returned values are accepted
 *  - chainId validated against OPTIMISM_CHAIN_IDS before PREPARE
 *  - Wrong-network is detected and transitions to an explicit error state
 *  - Write readiness gate (V2-FE-100) runs before PREPARE; fail closed
 *  - Intent is invalidated when account or chain changes mid-flow
 *  - No Stellar/Freighter runtime dependencies
 *  - contract ABIs throw NotImplemented until V2-FE-003/005 are merged
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  useAccount,
  useChainId,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSendTransaction,
} from 'wagmi';

import {
  OPTIMISM_CHAIN_IDS,
  TransactionMachineError,
  isValidChain,
} from '@/lib/transaction-machine/transaction-machine.types';
import {
  assertWriteReady,
  evaluateWriteTarget,
  mapGateFailureToMachineReason,
  resolveCanonicalTargetAddress,
} from '@/lib/contracts/write-gate';

import {
  useTransactionMachine,
  type UseTransactionMachineOptions,
} from './useTransactionMachine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WriteContractParams {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export interface SendTransactionParams {
  to: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
}

export interface UseEvmTransactionOptions extends UseTransactionMachineOptions {
  /**
   * Expected chain ID. Defaults to Optimism Mainnet (10).
   * Must be in OPTIMISM_CHAIN_IDS (or 31337 when allowLocalDev is true).
   */
  expectedChainId?: number;
  /**
   * Minimum confirmations before transitioning to `safe`.
   * Default: 1 (Optimism finalises quickly on L2).
   */
  safeConfirmations?: number;
  /**
   * If true, emit `INDEXING` after `safe` and wait for `FINALIZE` to be
   * sent externally by the caller once the backend indexer acknowledges.
   * Default: false (skip indexing, go directly safe → finalized).
   */
  enableIndexing?: boolean;
}

export interface UseEvmTransactionReturn {
  /** Current state from the machine. */
  state: ReturnType<typeof useTransactionMachine>['state'];
  /** Send a raw machine event (for advanced control). */
  send: ReturnType<typeof useTransactionMachine>['send'];
  /** Reset to idle and clear persisted state. */
  reset: ReturnType<typeof useTransactionMachine>['reset'];
  /** Last machine error, if any. */
  lastError: ReturnType<typeof useTransactionMachine>['lastError'];
  /** Execute a contract write and drive the machine. */
  writeContract: (params: WriteContractParams) => Promise<void>;
  /** Execute a raw ETH send and drive the machine. */
  sendTransaction: (params: SendTransactionParams) => Promise<void>;
  /** Whether the wallet is on the expected network. */
  isCorrectNetwork: boolean;
  /** Connected wallet address, or undefined if disconnected. */
  address: `0x${string}` | undefined;
  /** Latest write-gate evaluation (fail closed before any sign). */
  readiness: ReturnType<typeof evaluateWriteTarget>;
  /** True only when the write-gate reports ready. */
  isWriteReady: boolean;
}

// ---------------------------------------------------------------------------
// Safe confirmation threshold (Optimism L2)
// ---------------------------------------------------------------------------
const DEFAULT_SAFE_CONFIRMATIONS = 1;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEvmTransaction(
  opts: UseEvmTransactionOptions = {},
): UseEvmTransactionReturn {
  const {
    expectedChainId = OPTIMISM_CHAIN_IDS[0], // Optimism Mainnet
    allowLocalDev = false,
    safeConfirmations = DEFAULT_SAFE_CONFIRMATIONS,
    enableIndexing = false,
    ...machineOpts
  } = opts;

  // Wagmi hooks
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const isCorrectNetwork =
    isValidChain(chainId, allowLocalDev) &&
    (chainId === expectedChainId || allowLocalDev);

  // Wagmi write/send hooks
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  // Machine
  const { state, send, reset, lastError } = useTransactionMachine({
    ...machineOpts,
    allowLocalDev,
  });

  // V2-FE-100: fail-closed write readiness (chain, account, address)
  // Uses canonical release target for UI readiness; write paths re-check params.address.
  const readiness = evaluateWriteTarget({
    account: address ?? null,
    chainId,
    expectedChainId,
    targetAddress: resolveCanonicalTargetAddress(),
    allowLocalDev,
  });

  // Intent invalidation: drop an in-flight intent if account/chain changes
  // before a real hash exists (never fabricate continuity across wallets).
  const intentRef = useRef<{
    address: string | undefined;
    chainId: number;
    hasHash: boolean;
  } | null>(null);

  useEffect(() => {
    const intent = intentRef.current;
    if (!intent) return;
    if (intent.hasHash) return; // submitted — receipt tracking owns the lifecycle

    const accountChanged = intent.address !== address;
    const chainChanged = intent.chainId !== chainId;
    if (accountChanged || chainChanged) {
      intentRef.current = null;
      if (
        state.status === 'preparing' ||
        state.status === 'signature-requested'
      ) {
        send({ type: 'RESET' });
      }
    }
  }, [address, chainId, state.status, send]);

  // Watch receipt for the current submitted/confirming hash
  const submittedHash =
    (state.status === 'submitted' || state.status === 'confirming') &&
    state.txHash
      ? state.txHash
      : undefined;

  const { data: receipt } = useWaitForTransactionReceipt({
    hash: submittedHash,
  });

  // React to receipt changes
  useEffect(() => {
    if (!receipt) return;
    if (state.status !== 'submitted' && state.status !== 'confirming') return;

    const receiptStatus = receipt.status;

    if (receiptStatus === 'reverted') {
      send({ type: 'REVERT' });
      return;
    }

    // Successful inclusion
    if (state.status === 'submitted') {
      send({
        type: 'CONFIRM',
        blockNumber: receipt.blockNumber,
        confirmations: 1,
        receiptChainId: Number(receipt.chainId ?? chainId),
      });
    }

    const confirmations = 1;
    if (state.status === 'confirming' && confirmations >= safeConfirmations) {
      send({ type: 'MARK_SAFE' });

      if (enableIndexing) {
        send({ type: 'INDEXING' });
      } else {
        send({ type: 'FINALIZE' });
      }
    }
  }, [receipt, state.status, send, chainId, safeConfirmations, enableIndexing]);

  // ---------------------------------------------------------------------------
  // writeContract
  // ---------------------------------------------------------------------------

  const writeContract = useCallback(
    async (params: WriteContractParams): Promise<void> => {
      // V2-FE-100 readiness gate — fail closed before PREPARE
      const gate = evaluateWriteTarget({
        account: address ?? null,
        chainId,
        expectedChainId,
        targetAddress: params.address,
        allowLocalDev,
      });
      if (!gate.ready) {
        const primary = gate.failures[0];
        throw new TransactionMachineError(
          primary ? mapGateFailureToMachineReason(primary) : 'INVALID_TRANSITION',
          primary?.message ?? 'Write readiness could not be established',
        );
      }

      // Extra invariant: assert (throws WriteGateError) for exhaustive codes
      assertWriteReady({
        account: address ?? null,
        chainId,
        expectedChainId,
        targetAddress: params.address,
        allowLocalDev,
      });

      intentRef.current = {
        address: address ?? undefined,
        chainId,
        hasHash: false,
      };

      // Drive: idle → preparing
      send({ type: 'PREPARE', chainId });

      try {
        // Drive: preparing → signature-requested
        send({ type: 'REQUEST_SIGNATURE' });

        // Wagmi handles wallet popup
        const txHash = await writeContractAsync({
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args,
          ...(params.value !== undefined ? { value: params.value } : {}),
        } as never);

        if (intentRef.current) {
          intentRef.current.hasHash = true;
        }

        // Drive: signature-requested → submitted
        send({ type: 'SUBMIT', txHash });
      } catch (err: unknown) {
        intentRef.current = null;
        const isUserRejection =
          err instanceof Error &&
          (err.message.includes('User rejected') ||
            err.message.includes('user rejected') ||
            err.message.includes('4001'));

        if (isUserRejection) {
          send({ type: 'USER_REJECTED' });
        } else {
          send({ type: 'RESET' });
          throw err;
        }
      }
    },
    [
      isConnected,
      address,
      isCorrectNetwork,
      chainId,
      expectedChainId,
      allowLocalDev,
      send,
      writeContractAsync,
    ],
  );

  // ---------------------------------------------------------------------------
  // sendTransaction
  // ---------------------------------------------------------------------------

  const sendTransaction = useCallback(
    async (params: SendTransactionParams): Promise<void> => {
      // V2-FE-100 readiness gate — fail closed before PREPARE
      const gate = evaluateWriteTarget({
        account: address ?? null,
        chainId,
        expectedChainId,
        targetAddress: params.to,
        allowLocalDev,
      });
      if (!gate.ready) {
        const primary = gate.failures[0];
        throw new TransactionMachineError(
          primary ? mapGateFailureToMachineReason(primary) : 'INVALID_TRANSITION',
          primary?.message ?? 'Write readiness could not be established',
        );
      }

      intentRef.current = {
        address: address ?? undefined,
        chainId,
        hasHash: false,
      };

      send({ type: 'PREPARE', chainId });

      try {
        send({ type: 'REQUEST_SIGNATURE' });

        const txHash = await sendTransactionAsync({
          to: params.to,
          value: params.value,
          data: params.data,
        });

        if (intentRef.current) {
          intentRef.current.hasHash = true;
        }

        send({ type: 'SUBMIT', txHash });
      } catch (err: unknown) {
        intentRef.current = null;
        const isUserRejection =
          err instanceof Error &&
          (err.message.includes('User rejected') ||
            err.message.includes('user rejected') ||
            err.message.includes('4001'));

        if (isUserRejection) {
          send({ type: 'USER_REJECTED' });
        } else {
          send({ type: 'RESET' });
          throw err;
        }
      }
    },
    [
      isConnected,
      address,
      isCorrectNetwork,
      chainId,
      expectedChainId,
      allowLocalDev,
      send,
      sendTransactionAsync,
    ],
  );

  return {
    state,
    send,
    reset,
    lastError,
    writeContract,
    sendTransaction,
    isCorrectNetwork,
    address,
    readiness,
    isWriteReady: readiness.ready,
  };
}
