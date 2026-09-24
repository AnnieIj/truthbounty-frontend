/**
 * V2-FE-044 — Adversarial claim lifecycle regression suite.
 *
 * Exercises disturbances against the canonical lifecycle:
 *  - reload recovery (localStorage persistence)
 *  - wallet / account / chain changes
 *  - RPC failure
 *  - API lag (projection without receipt)
 *  - transaction replacement
 *  - reorg reconciliation
 *
 * Invariants:
 *  - On-chain receipts remain the authority for mutations
 *  - API lag never fabricates finality or loses pending state
 *  - Accessible error messaging on failure paths
 *  - Test doubles isolated to this harness
 */

import React from 'react';
import { render, renderHook, act, waitFor, screen } from '@testing-library/react';
import * as wagmi from 'wagmi';

// Local jest.fn() controls — global setup exposes plain functions only.
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
  useBlockNumber: jest.fn(),
  usePublicClient: jest.fn(),
  useWalletClient: jest.fn(),
  useDisconnect: jest.fn(() => ({ disconnect: jest.fn() })),
  useConnect: jest.fn(() => ({ connect: jest.fn() })),
  useConnectors: jest.fn(() => []),
  useSwitchChain: jest.fn(() => ({ switchChain: jest.fn() })),
  useWriteContract: jest.fn(() => ({
    writeContractAsync: jest.fn().mockResolvedValue('0x' + '1'.repeat(64)),
  })),
  useWaitForTransactionReceipt: jest.fn(() => ({ data: null, isLoading: false })),
  useReadContract: jest.fn(() => ({ data: undefined, isLoading: false })),
  WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
  http: jest.fn(),
  createStorage: jest.fn(() => ({})),
  cookieStorage: {},
}));

import { transitionTxState } from '@/lib/transaction-machine/transaction-machine';
import {
  createIdleState,
  isContradictoryTransition,
  isValidChain,
  TransactionMachineError,
} from '@/lib/transaction-machine/transaction-machine.types';
import {
  persistTxState,
  hydrateTxState,
  clearTxState,
  createTxContext,
  updateTxContext,
  listPersistedTxIds,
} from '@/lib/transaction-machine/transaction-persistence';
import {
  trackPendingTransaction,
  getPendingTransactions,
  clearPendingTransaction,
  subscribeToPendingTransactions,
} from '@/lib/pending-transactions';
import { useReceiptProjection } from '@/hooks/useReceiptProjection';
import { useTransactionRecovery } from '@/hooks/useTransactionRecovery';
import { reconcileVerificationState } from '@/app/lib/verification-reconcile';
import { useStateReconciliation, ProtocolError } from '@/hooks/useStateReconciliation';
import { useSettlementDetection } from '@/hooks/useSettlementDetection';
import { useWalletNetwork } from '@/hooks/useWalletNetwork';
import {
  shouldWaitForFinality,
  assertNoFabricatedData,
  getStateMessage,
} from '@/lib/transaction-state';
import type { Transaction, TransactionMetadata } from '@/app/types/transaction';
import { TransactionStatus } from '@/components/features/claim-verification/TransactionStatus';

const USER = '0x1234567890123456789012345678901234567890' as const;
const CONTRACT = '0x742D35Cc6634c0532925A3b844BC9E7595f0eB1e' as const;
const OP_MAINNET = 10;
const TX_HASH =
  '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888' as const;
const REPLACEMENT_HASH =
  '0x999911118888222277773333666644445555eeeeffff0000aaaabbbbccccdddd' as const;

const txMetadata: TransactionMetadata = {
  id: 'lifecycle-adversarial',
  createdAt: Date.now() - 60_000,
  updatedAt: Date.now(),
  retryCount: 2,
};

const chainFinality = {
  isL2: true,
  safeConfirmations: 1,
  finalizedConfirmations: 12,
  expectedBlockTimeMs: 2000,
  maxConfirmationTimeMs: 30_000,
  maxAgeMs: 120_000,
  staleness: { maxAgeMs: 120_000, maxConfirmationTimeMs: 30_000 },
} as any;

function baseTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    state: 'submitted',
    hash: TX_HASH,
    fromAddress: USER,
    toAddress: CONTRACT,
    chainId: OP_MAINNET,
    timestamp: Date.now() - 60_000,
    ...overrides,
  } as Transaction;
}

function confirmedTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    state: 'confirmed',
    hash: TX_HASH,
    fromAddress: USER,
    toAddress: CONTRACT,
    chainId: OP_MAINNET,
    timestamp: Date.now() - 30_000,
    blockNumber: 100n,
    blockHash: '0xblockhashblockhashblockhashblockhashblockhashblockhashblockhashblo',
    transactionIndex: 0,
    confirmations: 1,
    receipt: {
      status: 'success',
      gasUsed: 21000n,
      cumulativeGasUsed: 21000n,
      logs: [],
    },
    ...overrides,
  } as Transaction;
}

describe('V2-FE-044 — Adversarial lifecycle disturbances', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    (wagmi.useAccount as jest.Mock).mockReturnValue({
      address: USER,
      isConnected: true,
      isConnecting: false,
      isDisconnected: false,
      isReconnecting: false,
      chainId: OP_MAINNET,
      status: 'connected',
      connector: { id: 'injected' },
    });
    (wagmi.useChainId as jest.Mock).mockReturnValue(OP_MAINNET);
    (wagmi.useBlockNumber as jest.Mock).mockReturnValue({ data: BigInt(12345678) });
    (wagmi.usePublicClient as jest.Mock).mockReturnValue({
      chain: { id: OP_MAINNET },
      readContract: jest.fn(),
      simulateContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
      getTransactionReceipt: jest.fn(),
      getBlockNumber: jest.fn(),
    });
    (wagmi.useWalletClient as jest.Mock).mockReturnValue({ data: {} });
    (wagmi.useConnectors as jest.Mock).mockReturnValue([]);
    (wagmi.useConnect as jest.Mock).mockReturnValue({
      connect: jest.fn(),
      connectAsync: jest.fn(),
      isPending: false,
    });
    (wagmi.useDisconnect as jest.Mock).mockReturnValue({
      disconnect: jest.fn(),
      disconnectAsync: jest.fn(),
    });
    (wagmi.useWriteContract as jest.Mock).mockReturnValue({
      writeContract: jest.fn(),
      writeContractAsync: jest.fn(),
      isPending: false,
      data: undefined,
      error: null,
    });
  });

  // -------------------------------------------------------------------------
  // Reload
  // -------------------------------------------------------------------------
  describe('Reload recovery', () => {
    it('does not lose a pending submitted transaction across reload', () => {
      let ctx = createTxContext('dispute:reload', 'Open dispute');
      let state = transitionTxState(ctx.state, { type: 'PREPARE', chainId: OP_MAINNET });
      state = transitionTxState(state, { type: 'REQUEST_SIGNATURE' });
      state = transitionTxState(state, { type: 'SUBMIT', txHash: TX_HASH });
      ctx = updateTxContext(ctx, state);
      persistTxState(ctx);

      expect(listPersistedTxIds()).toContain('dispute:reload');

      const hydrated = hydrateTxState('dispute:reload');
      expect(hydrated?.state.status).toBe('submitted');
      expect(hydrated?.state.txHash).toBe(TX_HASH);
      expect(hydrated?.state.error).toBeNull();
    });

    it('discards corrupt or schema-stale persisted records without throwing', () => {
      localStorage.setItem('tb-tx-v2:corrupt', '{not-json');
      localStorage.setItem(
        'tb-tx-v2:stale',
        JSON.stringify({ schemaVersion: 1, id: 'stale', state: { status: 'idle' } }),
      );
      expect(hydrateTxState('corrupt')).toBeNull();
      expect(hydrateTxState('stale')).toBeNull();
      // Valid entries still hydrate.
      persistTxState(createTxContext('ok', 'OK'));
      expect(hydrateTxState('ok')).not.toBeNull();
      expect(listPersistedTxIds()).toEqual(['ok']);
    });

    it('pending registry survives reload and can be cleared after terminal state', () => {
      trackPendingTransaction({
        id: 'verification:reload',
        kind: 'verification',
        title: 'Verification pending',
        description: 'reloaded',
        txHash: TX_HASH,
        chainId: OP_MAINNET,
        machineState: 'submitted',
      });

      // Simulate page reload — read fresh from storage.
      const afterReload = getPendingTransactions();
      expect(afterReload).toHaveLength(1);
      expect(afterReload[0].machineState).toBe('submitted');

      clearPendingTransaction('verification:reload');
      expect(getPendingTransactions()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Wallet / account / chain changes
  // -------------------------------------------------------------------------
  describe('Wallet, account, and chain changes', () => {
    it('rejects PREPARE on a non-Optimism chain (wrong network fail-closed)', () => {
      expect(() =>
        transitionTxState(createIdleState(), { type: 'PREPARE', chainId: 1 }),
      ).toThrow(TransactionMachineError);
      expect(isValidChain(1)).toBe(false);
      expect(isValidChain(OP_MAINNET)).toBe(true);
      expect(isValidChain(11155420)).toBe(true);
    });

    it('invalidates prepared intent when the account/chain becomes unsupported', () => {
      // Prepare on correct chain, then chain changes to 137 — recovery reports wrong-network.
      const recovery = renderHook(() =>
        useTransactionRecovery({ txHash: TX_HASH, chainId: 137, status: 'pending' }),
      );
      expect(recovery.result.current.state).toBe('wrong-network');
      expect(recovery.result.current.isWrongNetwork).toBe(true);
      // Duplicate submit is allowed only after an explicit wrong-network diagnosis.
      expect(recovery.result.current.shouldDuplicateSubmit).toBe(true);
    });

    it('wallet network helper classifies unsupported chains', () => {
      const { result } = renderHook(() =>
        useWalletNetwork({ chainId: 137, isConnected: true }),
      );
      expect(result.current.action).toBe('unsupported');

      const ok = renderHook(() =>
        useWalletNetwork({ chainId: OP_MAINNET, isConnected: true }),
      );
      expect(['none', 'switch']).toContain(ok.result.current.action);
    });

    it('settlement detection blocks on wrong network', async () => {
      (wagmi.useChainId as jest.Mock).mockReturnValue(1);
      const { result } = renderHook(() =>
        useSettlementDetection({
          claimId: 'claim-1',
          contractAddress: CONTRACT,
          expectedChainId: OP_MAINNET,
          pollInterval: 0,
        }),
      );
      await waitFor(() => {
        expect(result.current.validation?.isValid).toBe(false);
      });
      expect(result.current.validation?.error).toMatch(/wrong network/i);
      expect(result.current.provisionalAction).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // RPC failure
  // -------------------------------------------------------------------------
  describe('RPC failure', () => {
    it('reconciliation fails closed when the public client is missing', async () => {
      (wagmi.usePublicClient as jest.Mock).mockReturnValue(undefined);
      const { result } = renderHook(() => useStateReconciliation());
      // Wrap reconcile state updates in act to avoid unmounted/async setState warnings.
      await act(async () => {
        try {
          await result.current.reconcile({
            id: 'x',
            type: 'SETTLE_PROVISIONAL',
            claimId: 'claim-1',
            transactionHash: TX_HASH,
            status: 'pending',
            submittedAt: new Date().toISOString(),
          } as any);
        } catch {
          // expected — fail-closed paths reject
        }
      });
      await expect(
        (async () =>
          result.current.reconcile({
            id: 'x2',
            type: 'SETTLE_PROVISIONAL',
            claimId: 'claim-1',
            transactionHash: TX_HASH,
            status: 'pending',
            submittedAt: new Date().toISOString(),
          } as any))(),
      ).rejects.toBeInstanceOf(ProtocolError);
    });

    it('reconciliation fails closed on an unsupported chain', async () => {
      (wagmi.usePublicClient as jest.Mock).mockReturnValue({
        chain: { id: 1 },
        waitForTransactionReceipt: jest.fn(),
      });
      const { result } = renderHook(() => useStateReconciliation({ timeout: 500 }));
      await expect(
        result.current.reconcile({
          id: 'x',
          type: 'SETTLE_PROVISIONAL',
          claimId: 'claim-1',
          transactionHash: TX_HASH,
          status: 'pending',
          submittedAt: new Date().toISOString(),
        } as any),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_CHAIN' });
    });

    it('RPC failure never fabricates a success receipt', () => {
      // Pending submitted tx with no receipt must not report finalized/safe.
      const pending = baseTx();
      expect(shouldWaitForFinality(pending, txMetadata, chainFinality)).toBe(true);
      expect(() => assertNoFabricatedData(pending)).not.toThrow();

      // A fabricated low-entropy hash is rejected by the integrity guard.
      expect(() =>
        assertNoFabricatedData(baseTx({ hash: '0x1111111111111111111111111111111111111111111111111111111111111111' })),
      ).toThrow(/Suspicious transaction hash|Dummy/);
    });

    it('surfaces an accessible error message for failed transaction status', async () => {
      const { container } = render(<TransactionStatus status="error" />);
      expect(screen.getByText(/transaction failed/i)).toBeInTheDocument();
      const { assertAccessible } = await import('../utils/axe');
      await assertAccessible(container);
    });
  });

  // -------------------------------------------------------------------------
  // API lag
  // -------------------------------------------------------------------------
  describe('API lag', () => {
    it('projection ahead of receipt is stale — never final', () => {
      const { result } = renderHook(() =>
        useReceiptProjection({
          txHash: TX_HASH,
          chainId: OP_MAINNET,
          claimId: 'claim-1',
          receipt: undefined,
          projection: { txHash: TX_HASH, status: 'confirmed', claimId: 'claim-1' },
        }),
      );
      expect(result.current.status).toBe('stale');
      expect(result.current.isMismatch).toBe(true);
      expect(result.current.status).not.toBe('confirmed');
    });

    it('receipt rejected wins over a lagging optimistic projection', () => {
      const { result } = renderHook(() =>
        useReceiptProjection({
          txHash: TX_HASH,
          chainId: OP_MAINNET,
          receipt: {
            transactionHash: TX_HASH,
            status: '0x0',
            blockNumber: 5n,
            chainId: OP_MAINNET,
          },
          projection: { txHash: TX_HASH, status: 'confirmed' },
        }),
      );
      expect(result.current.status).toBe('rejected');
      expect(result.current.isProtocolDisabled).toBe(true);
    });

    it('reconcileVerificationState reports stale when projection lacks on-chain position', () => {
      const out = reconcileVerificationState({
        chainId: OP_MAINNET,
        claimId: 'claim-1',
        projection: { status: 'confirmed', claimId: 'claim-1', chainId: OP_MAINNET },
        onChain: null,
      });
      expect(out.status).toBe('stale');
      expect(out.isMismatch).toBe(true);
      expect(out.status).not.toBe('confirmed');
    });

    it('does not lose pending state while the API lags', () => {
      trackPendingTransaction({
        id: 'verification:lag',
        kind: 'verification',
        title: 'Verification pending',
        description: 'API lag',
        txHash: TX_HASH,
        chainId: OP_MAINNET,
        machineState: 'submitted',
      });
      // Even if projection is stale, the pending registry still holds the tx.
      const entries = getPendingTransactions();
      expect(entries.find((e) => e.id === 'verification:lag')).toMatchObject({
        txHash: TX_HASH,
        machineState: 'submitted',
      });
      clearPendingTransaction('verification:lag');
    });

    it('notifies subscribers when pending entries change (cache invalidation hook)', () => {
      const seen: number[] = [];
      const unsubscribe = subscribeToPendingTransactions((entries) => {
        seen.push(entries.length);
      });
      trackPendingTransaction({
        id: 'a',
        kind: 'dispute',
        title: 't',
        description: 'd',
        txHash: null,
        chainId: null,
        machineState: 'preparing',
      });
      expect(seen).toContain(1);
      clearPendingTransaction('a');
      expect(seen).toContain(0);
      unsubscribe();
    });
  });

  // -------------------------------------------------------------------------
  // Transaction replacement
  // -------------------------------------------------------------------------
  describe('Transaction replacement', () => {
    it('machine accepts REPLACE from submitted and stores the replacement hash', () => {
      let state = transitionTxState(createIdleState(), { type: 'PREPARE', chainId: OP_MAINNET });
      state = transitionTxState(state, { type: 'REQUEST_SIGNATURE' });
      state = transitionTxState(state, { type: 'SUBMIT', txHash: TX_HASH });
      expect(state.status).toBe('submitted');

      state = transitionTxState(state, { type: 'REPLACE', replacedBy: REPLACEMENT_HASH });
      expect(state.status).toBe('replaced');
      expect(state.replacedBy).toBe(REPLACEMENT_HASH);
      expect(state.txHash).toBe(TX_HASH);
    });

    it('recovery follows the replacement hash and forbids duplicate submit', () => {
      const { result } = renderHook(() =>
        useTransactionRecovery({
          txHash: TX_HASH,
          chainId: OP_MAINNET,
          status: 'replaced',
          replacementHash: REPLACEMENT_HASH,
        }),
      );
      expect(result.current.state).toBe('replaced');
      expect(result.current.replacementHash).toBe(REPLACEMENT_HASH);
      expect(result.current.shouldDuplicateSubmit).toBe(false);
    });

    it('does not treat a replacement as a fabricated success', () => {
      const replaced = baseTx({
        state: 'replaced',
        replacedBy: REPLACEMENT_HASH,
      } as any);
      // Replaced is not finalized — finality must still be withheld.
      expect(shouldWaitForFinality(replaced, txMetadata, chainFinality)).toBe(true);
      expect(isContradictoryTransition('replaced', 'safe')).toBe(false);
      expect(isContradictoryTransition('reverted', 'safe')).toBe(true);
      expect(isContradictoryTransition('dropped', 'finalized')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Reorg reconciliation
  // -------------------------------------------------------------------------
  describe('Reorg reconciliation', () => {
    it('withholds durable success while a confirmed receipt is not yet safe', () => {
      const confirmed = confirmedTx();
      expect(shouldWaitForFinality(confirmed, txMetadata, chainFinality)).toBe(true);

      const safe = confirmedTx({ state: 'safe' } as any);
      // L2 projection-backed UI still waits for indexer acknowledgement.
      expect(shouldWaitForFinality(safe, txMetadata, chainFinality)).toBe(true);
    });

    it('a previously confirmed tx that reorgs away must not stay confirmed without a receipt', () => {
      // After reorg, receipt is gone — state rolls back to submitted (pending).
      const orphaned = baseTx({ state: 'submitted', timestamp: Date.now() });
      expect(orphaned.state).toBe('submitted');
      expect(shouldWaitForFinality(orphaned, txMetadata, chainFinality)).toBe(true);
      expect(getStateMessage(orphaned, txMetadata, chainFinality)).toMatch(
        /Submitting|stale/i,
      );
    });

    it('machine forbids illegal post-reorg success jumps (reverted/dropped → safe)', () => {
      expect(isContradictoryTransition('reverted', 'safe')).toBe(true);
      expect(isContradictoryTransition('reverted', 'finalized')).toBe(true);
      expect(isContradictoryTransition('dropped', 'safe')).toBe(true);
      expect(isContradictoryTransition('idle', 'finalized')).toBe(true);
    });

    it('projection hash mismatch after reorg is reported as mismatch, not confirmed', () => {
      const { result } = renderHook(() =>
        useReceiptProjection({
          txHash: TX_HASH,
          chainId: OP_MAINNET,
          receipt: {
            transactionHash: TX_HASH,
            status: '0x1',
            blockNumber: 1n,
            chainId: OP_MAINNET,
          },
          projection: { txHash: REPLACEMENT_HASH, status: 'confirmed' },
        }),
      );
      // Hash mismatch between receipt and projection → mismatch path.
      expect(result.current.isMismatch).toBe(true);
      expect(result.current.status).not.toBe('confirmed');
    });

    it('wrong-network receipt is treated as mismatch (stale receipt guard)', () => {
      const { result } = renderHook(() =>
        useReceiptProjection({
          txHash: TX_HASH,
          chainId: OP_MAINNET,
          receipt: {
            transactionHash: TX_HASH,
            status: '0x1',
            chainId: 1,
          },
          projection: undefined,
        }),
      );
      expect(result.current.isWrongNetwork).toBe(true);
      expect(result.current.status).toBe('mismatch');
    });
  });
});
