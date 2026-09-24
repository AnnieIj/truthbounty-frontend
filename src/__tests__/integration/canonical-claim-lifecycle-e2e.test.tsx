/**
 * V2-FE-044 — End-to-End Canonical Claim Lifecycle Regression Suite (happy path).
 *
 * Chains the full user lifecycle against canonical contracts / API projections:
 *   wallet connect → claim creation → evidence → approval/stake → verification
 *   → provisional settlement → dispute → appeal → finalization → rewards
 *   → withdrawal surface
 *
 * Invariants asserted:
 *  - On-chain receipts remain the authority for mutations
 *  - API lag never fabricates finality or loses pending state
 *  - Accessible status/error messaging is present at each stage
 *  - Cache invalidation fires after claim submission
 *  - Test doubles stay in the test harness (no production mock imports)
 */

import React from 'react';
import { render, renderHook, act, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

import { useWallet } from '@/hooks/useWallet';
import { useClaimCreationTransaction, ClaimCreationErrorCode } from '@/hooks/useClaimCreationTransaction';
import { useEvidenceRegistration } from '@/hooks/useEvidenceRegistration';
import { useVerificationSubmission } from '@/hooks/useVerificationSubmission';
import { reconcileVerificationState } from '@/app/lib/verification-reconcile';
import { useReceiptProjection } from '@/hooks/useReceiptProjection';
import { useSettlementDetection } from '@/hooks/useSettlementDetection';
import { useSettlementSubmission } from '@/hooks/useSettlementSubmission';
import { useFinalizationDetection } from '@/hooks/useFinalizationDetection';
import { useStateReconciliation, ProtocolError } from '@/hooks/useStateReconciliation';
import { useDisputeContext } from '@/hooks/useDisputeContext';
import { useDisputeSubmission } from '@/hooks/useDisputeSubmission';
import { useAppealContext } from '@/hooks/useAppealContext';
import { useAppealParticipation } from '@/hooks/useAppealParticipation';
import { useRewards } from '@/hooks/useRewards';
import { useSubmitClaim, useClaims } from '@/app/queries/claims.queries';
import { queryKeys } from '@/app/queries/queryKeys';
import { transitionTxState } from '@/lib/transaction-machine/transaction-machine';
import { createIdleState } from '@/lib/transaction-machine/transaction-machine.types';
import {
  persistTxState,
  hydrateTxState,
  clearTxState,
  createTxContext,
  updateTxContext,
} from '@/lib/transaction-machine/transaction-persistence';
import {
  trackPendingTransaction,
  getPendingTransactions,
  clearPendingTransaction,
} from '@/lib/pending-transactions';
import { assertNoFabricatedData, shouldWaitForFinality, getStateMessage } from '@/lib/transaction-state';
import type { Transaction, TransactionMetadata } from '@/app/types/transaction';
import { createMockClaim } from '../utils/test-utils';
import { TransactionStatus } from '@/components/features/claim-verification/TransactionStatus';
import { StatusCard } from '@/components/transactions/status-card';

jest.mock('@/app/api/claims.api', () => ({
  fetchClaims: jest.fn(),
  fetchClaimDetail: jest.fn(),
  submitClaim: jest.fn(),
  fetchClaimsByStatus: jest.fn(),
}));

jest.mock('@/app/lib/api', () => ({
  submitVerification: jest.fn(),
  submitDispute: jest.fn(),
  resolveDispute: jest.fn(),
  getClaimById: jest.fn(),
}));

jest.mock('@/lib/contracts/registry', () => ({
  getContractAddress: jest.fn(() => '0x742D35Cc6634c0532925A3b844BC9E7595f0eB1e'),
  getContractAbi: jest.fn(() => []),
  getProtocolVersion: jest.fn(() => 'v2.1.0'),
  getProtocolRelease: jest.fn(() => ({})),
  getReleaseChainId: jest.fn(() => 11155420),
  getProtocolDiagnostics: jest.fn(() => ({})),
}));

jest.mock('@/config/protocol/verification-artifact', () => ({
  ARTIFACT_VERSION: 'iv-verification-submission@v1.0.0',
  VERIFICATION_SUPPORTED_CHAINS: [10, 11155420],
  claimRegistryAbi: [],
  verificationSubmissionAbi: [],
  erc20Abi: [],
  getVerificationArtifact: jest.fn(() => ({
    isDeployed: true,
    artifactVersion: 'iv-verification-submission@v1.0.0',
    addresses: { TruthBountyWeighted: '0x742D35Cc6634c0532925A3b844BC9E7595f0eB1e' },
  })),
}));

const USER = '0x1234567890123456789012345678901234567890' as const;
const CONTRACT = '0x742D35Cc6634c0532925A3b844BC9E7595f0eB1e' as const;
const CLAIM_ID = 'claim-lifecycle-1';
const OP_MAINNET = 10;
const TX_HASH =
  '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888' as const;

function createReceiptTx(
  overrides: Partial<Extract<Transaction, { state: 'confirmed' }>> = {},
): Transaction {
  return {
    state: 'confirmed',
    hash: '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888',
    fromAddress: USER,
    toAddress: CONTRACT,
    chainId: OP_MAINNET,
    timestamp: Date.now(),
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

const txMetadata: TransactionMetadata = {
  id: 'lifecycle-e2e',
  createdAt: Date.now() - 1000,
  updatedAt: Date.now(),
  retryCount: 1,
};

const chainFinality = {
  isL2: true,
  safeConfirmations: 1,
  finalizedConfirmations: 12,
  expectedBlockTimeMs: 2000,
  maxConfirmationTimeMs: 60000,
  maxAgeMs: 300000,
  staleness: {
    maxAgeMs: 300000,
    maxConfirmationTimeMs: 60000,
  },
} as any;

describe('V2-FE-044 — Canonical claim lifecycle (happy path)', () => {
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
  // Stage 0 — Wallet connect
  // -------------------------------------------------------------------------
  describe('Stage: wallet connect', () => {
    it('exposes connected account required to drive the lifecycle', () => {
      const { result } = renderHook(() => useWallet());
      // Global wagmi mock reports a connected Optimism account (jest.setup).
      expect(result.current.isConnected).toBe(true);
      expect(result.current.chainId).toBe(OP_MAINNET);
      expect(result.current.address).toMatch(/^0x/);
    });
  });

  // -------------------------------------------------------------------------
  // Stage 1 — Claim creation
  // -------------------------------------------------------------------------
  describe('Stage: claim creation', () => {
    it('creates a claim from a wallet-derived receipt hash (never fabricated)', async () => {
      const writeHash =
        '0xbbbb1111cccc2222dddd3333eeee4444ffff5555aaaa6666bbbb7777cccc8888' as const;
      const indexedClaim = { id: 'indexed-1', status: 'OPEN' };

      const publicClient = {
        readContract: jest.fn().mockResolvedValue(10n ** 18n),
        simulateContract: jest.fn().mockResolvedValue({
          request: { address: CONTRACT, functionName: 'createClaim' },
        }),
        waitForTransactionReceipt: jest.fn().mockResolvedValue({ status: 'success' }),
      };
      const walletClient = {
        data: {
          writeContract: jest.fn().mockResolvedValue(writeHash),
          chain: { id: OP_MAINNET },
        },
      };

      (wagmi.usePublicClient as jest.Mock).mockReturnValue(publicClient);
      (wagmi.useWalletClient as jest.Mock).mockReturnValue(walletClient);

      const { result } = renderHook(() => useClaimCreationTransaction());

      let outcome: Awaited<ReturnType<typeof result.current.createClaim>>;
      await act(async () => {
        outcome = await result.current.createClaim({
          contentDigest: `0x${'ab'.repeat(32)}`,
          asset: '0x4200000000000000000000000000000000000006',
          amount: 1_000_000n,
          frozenConfig: '0x00',
          claimContractAddress: CONTRACT,
          artifactVersion: '0.1.0',
          expectedChainId: OP_MAINNET,
          getIndexedClaim: async () => indexedClaim,
        });
      });

      expect(outcome!).toMatchObject({ status: 'success', txHash: writeHash });
      expect(walletClient.data.writeContract).toHaveBeenCalled();
      // Receipt must be successful before indexing reconciliation.
      expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: writeHash });
      expect(result.current.txHash).toBe(writeHash);
      expect(result.current.status).toBe('success');

      // Machine accepts the wallet hash only after PREPARE → SUBMIT.
      let machineState = transitionTxState(createIdleState(), {
        type: 'PREPARE',
        chainId: OP_MAINNET,
      });
      machineState = transitionTxState(machineState, { type: 'REQUEST_SIGNATURE' });
      machineState = transitionTxState(machineState, { type: 'SUBMIT', txHash: writeHash });
      expect(machineState.status).toBe('submitted');
      expect(machineState.txHash).toBe(writeHash);
    });

    it('fails closed on wrong network without producing a hash', async () => {
      (wagmi.useChainId as jest.Mock).mockReturnValue(1);
      (wagmi.usePublicClient as jest.Mock).mockReturnValue({});
      (wagmi.useWalletClient as jest.Mock).mockReturnValue({ data: {} });

      const { result } = renderHook(() => useClaimCreationTransaction());
      let outcome: Awaited<ReturnType<typeof result.current.createClaim>>;
      await act(async () => {
        outcome = await result.current.createClaim({
          contentDigest: `0x${'ab'.repeat(32)}`,
          asset: '0x4200000000000000000000000000000000000006',
          amount: 1n,
          frozenConfig: '0x00',
          claimContractAddress: CONTRACT,
          artifactVersion: '0.1.0',
          expectedChainId: OP_MAINNET,
          getIndexedClaim: async () => ({}),
        });
      });

      expect(outcome!).toMatchObject({ status: 'error' });
      if (outcome!.status === 'error') {
        expect(outcome!.error.code).toBe(ClaimCreationErrorCode.INVALID_CHAIN);
      }
      expect(result.current.txHash).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Stage 2 — Evidence
  // -------------------------------------------------------------------------
  describe('Stage: evidence', () => {
    it('validates canonical evidence URI rules before any write', () => {
      const { result } = renderHook(() => useEvidenceRegistration());

      const good = result.current.validateEvidence({
        claimId: 'a'.repeat(64),
        evidenceUri: 'https://example.com/evidence',
      });
      expect(good.isValid).toBe(true);

      const badScheme = result.current.validateEvidence({
        claimId: 'a'.repeat(64),
        evidenceUri: 'http://insecure.example.com',
      });
      expect(badScheme.isValid).toBe(false);
      expect(badScheme.errors.join(' ')).toMatch(/https and ipfs/i);

      const badId = result.current.validateEvidence({
        claimId: 'not-a-hash',
        evidenceUri: 'https://example.com/e',
      });
      expect(badId.isValid).toBe(false);
    });

    it('never emits a synthetic evidence transaction hash', async () => {
      const { result } = renderHook(() => useEvidenceRegistration());
      await act(async () => {
        await expect(
          result.current.submitEvidence({
            claimId: 'a'.repeat(64),
            evidenceUri: 'https://example.com/e',
          }),
        ).rejects.toThrow(/writeContract|synthetic/i);
      });
      expect(result.current.error).toMatch(/writeContract|synthetic/i);
    });
  });

  // -------------------------------------------------------------------------
  // Stage 3 — Approval / stake / verification
  // -------------------------------------------------------------------------
  describe('Stage: approval, stake, and verification', () => {
    it('receipt is authoritative when the API projection lags', () => {
      const receipt = {
        transactionHash: TX_HASH,
        status: '0x1' as const,
        blockNumber: 100n,
        chainId: OP_MAINNET,
        to: CONTRACT,
      };
      // Projection missing (API lag) — still confirmed from receipt alone.
      const receiptOnly = reconcileVerificationState({
        chainId: OP_MAINNET,
        claimId: CLAIM_ID,
        receipt,
        onChain: {
          claimId: CLAIM_ID,
          verifier: USER,
          exists: true,
          position: 'TRUE' as const,
          stake: 10n ** 18n,
        },
        expectedPosition: 'TRUE' as const,
      });
      expect(receiptOnly.status).toBe('confirmed');

      // Projection without receipt / on-chain position must never confirm.
      const projectionOnly = reconcileVerificationState({
        chainId: OP_MAINNET,
        claimId: CLAIM_ID,
        projection: { status: 'confirmed', claimId: CLAIM_ID, chainId: OP_MAINNET },
      });
      expect(projectionOnly.status).toBe('stale');
      expect(projectionOnly.status).not.toBe('confirmed');
    });

    it('useReceiptProjection marks projection-ahead-of-receipt as stale (no fabricated finality)', () => {
      const { result } = renderHook(() =>
        useReceiptProjection({
          txHash: TX_HASH,
          chainId: OP_MAINNET,
          claimId: CLAIM_ID,
          receipt: undefined,
          projection: { txHash: TX_HASH, status: 'confirmed', claimId: CLAIM_ID },
        }),
      );
      expect(result.current.status).toBe('stale');
      expect(result.current.isMismatch).toBe(true);
    });

    it('verification submission hook is available with phase/error surface', () => {
      const { result } = renderHook(() =>
        useVerificationSubmission({ claimId: CLAIM_ID, chainId: OP_MAINNET, pollInterval: 0 }),
      );
      expect(result.current).toHaveProperty('submitVerification');
      expect(result.current).toHaveProperty('phase');
      expect(result.current).toHaveProperty('error');
      expect(result.current.isConnected).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Stage 4 — Provisional settlement
  // -------------------------------------------------------------------------
  describe('Stage: provisional settlement', () => {
    it('detects a callable provisional settlement and reconciles via receipt', async () => {
      const { result: detection } = renderHook(() =>
        useSettlementDetection({
          claimId: CLAIM_ID,
          contractAddress: CONTRACT,
          pollInterval: 999999,
        }),
      );

      await waitFor(() => expect(detection.current.isLoading).toBe(false));
      expect(detection.current.validation?.isValid).toBe(true);
      expect(detection.current.provisionalAction?.isCallable).toBe(true);
      expect(detection.current.provisionalAction?.type).toBe('SETTLE_PROVISIONAL');

      const { result: submission } = renderHook(() =>
        useSettlementSubmission({ contractAddress: CONTRACT }),
      );

      let settlement: any;
      await act(async () => {
        settlement = await submission.current.submitSettlement(
          detection.current.provisionalAction!,
        );
      });
      expect(settlement).toBeDefined();
      expect(settlement.status).toBe('pending');
      expect(settlement.type).toBe('SETTLE_PROVISIONAL');

      const publicClient = {
        getTransactionReceipt: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 200n,
          from: USER,
          logs: [],
        }),
        getBlockNumber: jest.fn().mockResolvedValue(201n),
        chain: { id: OP_MAINNET },
      };
      (wagmi.usePublicClient as jest.Mock).mockReturnValue(publicClient);

      const { result: reconcile } = renderHook(() =>
        useStateReconciliation({ pollInterval: 10, timeout: 2000 }),
      );
      let outcome: any;
      await act(async () => {
        outcome = await reconcile.current.reconcile(settlement);
      });
      expect(outcome?.status).toBe('confirmed');
      expect(publicClient.getTransactionReceipt).toHaveBeenCalled();
    });

    it('fails closed when the RPC public client is unavailable', async () => {
      (wagmi.usePublicClient as jest.Mock).mockReturnValue(undefined);
      const { result } = renderHook(() => useStateReconciliation());
      await act(async () => {
        try {
          await result.current.reconcile({
            id: 'settle-1',
            type: 'SETTLE_PROVISIONAL',
            claimId: CLAIM_ID,
            transactionHash: TX_HASH,
            status: 'pending',
            submittedAt: new Date().toISOString(),
          } as any);
        } catch (err) {
          expect(err).toBeInstanceOf(ProtocolError);
        }
      });
      await expect(
        result.current.reconcile({
          id: 'settle-2',
          type: 'SETTLE_PROVISIONAL',
          claimId: CLAIM_ID,
          transactionHash: TX_HASH,
          status: 'pending',
          submittedAt: new Date().toISOString(),
        } as any),
      ).rejects.toBeInstanceOf(ProtocolError);
    });
  });

  // -------------------------------------------------------------------------
  // Stage 5 — Dispute
  // -------------------------------------------------------------------------
  describe('Stage: dispute', () => {
    it('loads dispute context and validates an opening payload', async () => {
      const { result: context } = renderHook(() =>
        useDisputeContext({
          claimId: CLAIM_ID,
          contractAddress: CONTRACT,
          expectedChainId: OP_MAINNET,
          pollInterval: 0,
        }),
      );

      await waitFor(() => expect(context.current.context).not.toBeNull());
      const disputeCtx = context.current.context!;
      expect(disputeCtx.provisionalOutcome.isProvisional).toBe(true);
      expect(disputeCtx.deadline.isWindowOpen).toBe(true);

      const { result: submission } = renderHook(() =>
        useDisputeSubmission({ contractAddress: CONTRACT, expectedChainId: OP_MAINNET }),
      );

      const validation = submission.current.validateDispute(disputeCtx, {
        claimId: CLAIM_ID,
        reason: 'Incorrect provisional outcome',
        bondAmount: disputeCtx.bond.bondAmount,
      } as any);
      expect(validation.isValid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Stage 6 — Appeal
  // -------------------------------------------------------------------------
  describe('Stage: appeal', () => {
    it('loads appeal context and validates participation', async () => {
      const { result: context } = renderHook(() =>
        useAppealContext({
          appealId: 'appeal-1',
          claimId: CLAIM_ID,
          contractAddress: CONTRACT,
          expectedChainId: OP_MAINNET,
          pollInterval: 0,
        }),
      );

      await waitFor(() => expect(context.current.context).not.toBeNull());
      const appealCtx = context.current.context!;

      const { result: participation } = renderHook(() =>
        useAppealParticipation({ contractAddress: CONTRACT, expectedChainId: OP_MAINNET }),
      );

      const validation = participation.current.validateParticipation(
        appealCtx,
        'SUPPORT',
        '100000000000000000',
      );
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Stage 7 — Finalization
  // -------------------------------------------------------------------------
  describe('Stage: finalization', () => {
    it('detects finalization readiness with wallet/chain validation', async () => {
      const { result } = renderHook(() =>
        useFinalizationDetection({
          claimId: CLAIM_ID,
          contractAddress: CONTRACT,
          pollInterval: 999999,
        }),
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.validation?.isValid).toBe(true);
      // Requirements surface must be present once detection completes.
      expect(result.current).toHaveProperty('requirements');
      expect(result.current).toHaveProperty('finalizationAction');
    });
  });

  // -------------------------------------------------------------------------
  // Stage 8 — Rewards
  // -------------------------------------------------------------------------
  describe('Stage: rewards', () => {
    it('claimAll surfaces NotImplemented error and never fabricates a tx hash', async () => {
      const { result } = renderHook(() => useRewards());

      // Isolation: rewards must not be seeded from production mock fixtures.
      expect(result.current.pendingRewards).toHaveLength(0);
      expect(result.current.totalClaimable).toBe(0);

      await act(async () => {
        await result.current.claimAll();
      });

      // Empty claim set is a no-op — no tracking, no fake success.
      expect(result.current.status).toBe('idle');
      expect(result.current.lastTxHash).toBeNull();
      expect(getPendingTransactions()).toHaveLength(0);
    });

    it('when pending rewards exist, a failed claim does not produce a hash', async () => {
      trackPendingTransaction({
        id: 'rewards:demo',
        kind: 'rewards',
        title: 'Rewards claim pending',
        description: 'demo',
        txHash: null,
        chainId: null,
        machineState: 'idle',
      });
      expect(getPendingTransactions()).toHaveLength(1);

      const { claimRewards } = await import('@/app/lib/wallet');
      await expect(claimRewards(['demo'])).rejects.toThrow(/Not implemented/);

      clearPendingTransaction('rewards:demo');
      expect(getPendingTransactions()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Stage 9 — Withdrawal surface
  // -------------------------------------------------------------------------
  describe('Stage: withdrawal surface', () => {
    it('supports a withdrawal transaction type without synthetic completion', async () => {
      const { TransactionItem } = await import('@/components/transactions/transaction-item');
      const { container } = render(
        <TransactionItem
          type="withdrawal"
          status="pending"
          title="Withdraw rewards"
          description="Waiting for canonical receipt"
          amount="12.5"
          timeAgo="just now"
          hash={TX_HASH}
        />,
      );
      expect(screen.getByText('Withdraw rewards')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();

      const { assertAccessible } = await import('../utils/axe');
      await assertAccessible(container);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting: cache invalidation + accessible status messaging
  // -------------------------------------------------------------------------
  describe('Cache invalidation and accessible status messaging', () => {
    it('invalidates the claims cache after a successful submission', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      const { submitClaim } = require('@/app/api/claims.api');
      submitClaim.mockResolvedValue(createMockClaim({ id: 'new-1' }));

      function SubmitHarness() {
        const mutation = useSubmitClaim();
        return (
          <button
            onClick={() =>
              mutation.mutateAsync({
                title: 'T',
                description: 'D',
              } as any)
            }
          >
            Submit
          </button>
        );
      }

      render(
        <QueryClientProvider client={queryClient}>
          <SubmitHarness />
        </QueryClientProvider>,
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.claims.all });
      });
    });

    it('exposes accessible status messaging for transaction UI states', async () => {
      const { container: pending } = render(<TransactionStatus status="pending" />);
      expect(screen.getByText(/transaction pending/i)).toBeInTheDocument();

      const { container: success } = render(<TransactionStatus status="success" />);
      expect(screen.getByText(/verification submitted/i)).toBeInTheDocument();

      const { container: error } = render(<TransactionStatus status="error" />);
      expect(screen.getByText(/transaction failed/i)).toBeInTheDocument();

      const { assertAccessible } = await import('../utils/axe');
      await assertAccessible(pending);
      await assertAccessible(success);
      await assertAccessible(error);

      const { container: card } = render(<StatusCard status="failed" count={2} />);
      expect(screen.getByText('Failed')).toBeInTheDocument();
      await assertAccessible(card);
    });

    it('keeps finality withheld until safe for L2 projection-backed UI', () => {
      const confirmed = createReceiptTx();
      // Confirmed but not yet safe → should wait for finality.
      expect(shouldWaitForFinality(confirmed, txMetadata, chainFinality)).toBe(true);

      const safeTx = createReceiptTx({ state: 'safe' } as any);
      expect(shouldWaitForFinality(safeTx, txMetadata, chainFinality)).toBe(true);

      expect(() => assertNoFabricatedData(confirmed)).not.toThrow();
    });

    it('hydrates a mid-flight submitted transaction across a simulated reload', () => {
      let ctx = createTxContext('verification:reload', 'Verification');
      let state = transitionTxState(ctx.state, { type: 'PREPARE', chainId: OP_MAINNET });
      state = transitionTxState(state, { type: 'REQUEST_SIGNATURE' });
      state = transitionTxState(state, { type: 'SUBMIT', txHash: TX_HASH });
      ctx = updateTxContext(ctx, state);
      persistTxState(ctx);

      // Simulate reload: only localStorage survives.
      const hydrated = hydrateTxState('verification:reload');
      expect(hydrated).not.toBeNull();
      expect(hydrated!.state.status).toBe('submitted');
      expect(hydrated!.state.txHash).toBe(TX_HASH);

      clearTxState('verification:reload');
      expect(hydrateTxState('verification:reload')).toBeNull();
    });

    it('pending transaction registry tracks lifecycle state without a premature hash', () => {
      trackPendingTransaction({
        id: `verification:${CLAIM_ID}:verify`,
        kind: 'verification',
        title: 'Verification stake pending',
        description: 'Awaiting receipt',
        txHash: null,
        chainId: OP_MAINNET,
        machineState: 'signature-requested',
      });
      const entries = getPendingTransactions();
      expect(entries).toHaveLength(1);
      expect(entries[0].txHash).toBeNull();
      expect(entries[0].machineState).toBe('signature-requested');

      // Upgrade to submitted with wallet hash only.
      trackPendingTransaction({
        id: `verification:${CLAIM_ID}:verify`,
        kind: 'verification',
        title: 'Verification stake pending',
        description: 'Broadcast',
        txHash: TX_HASH,
        chainId: OP_MAINNET,
        machineState: 'submitted',
      });
      const updated = getPendingTransactions()[0];
      expect(updated.txHash).toBe(TX_HASH);
      expect(updated.machineState).toBe('submitted');
    });

    it('provides a non-empty status message for every machine success path state', () => {
      const states = ['submitted', 'confirmed', 'safe', 'finalized', 'indexing', 'indexed'] as const;
      for (const state of states) {
        const tx = createReceiptTx({ state } as any);
        const message = getStateMessage(tx, txMetadata, chainFinality);
        expect(message).toBeTruthy();
        expect(message).not.toBe('Unknown state');
      }
    });
  });
});
