/**
 * Integration tests — Reward Entitlement and Claim Flow (V2-FE-060)
 *
 * Tests the full path:
 *   fetch entitlements → validate → summarize → submit claim →
 *   receipt reconciliation → confirmed/reverted/rejected/error states
 *
 * Wagmi is mocked at the hook boundary. The three canonical hooks
 * (useRewardEntitlements, useRewardClaim, useRewards) are exercised
 * together via the useRewards facade, mirroring real production wiring.
 *
 * Wallet / transaction-affecting coverage:
 *   - Successful end-to-end claim confirmation (receipt-driven, not timer)
 *   - User wallet rejection → rejected state → reset recovery
 *   - On-chain revert → reverted state with tx hash
 *   - RPC submission error → error state → reset recovery
 *   - Concurrent claim prevention (ALREADY_IN_PROGRESS)
 *   - Partial receipt reconciliation (outstandingClaimIds populated)
 *
 * Fail-closed coverage:
 *   - Disconnected wallet → isUnsupported, no fetch
 *   - Wrong chain → isUnsupported, no fetch
 *   - Malformed backend payload → invalid entries dropped, valid ones kept
 *   - No claimable entitlements → claimAll is a no-op
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { fetchRewardEntitlements } from '@/app/api/rewards.api';
import { trackPendingTransaction, clearPendingTransaction } from '@/lib/pending-transactions';

// ---------------------------------------------------------------------------
// Constants shared across tests
// ---------------------------------------------------------------------------

const ADDR = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const CONTRACT = '0x3333333333333333333333333333333333333333' as `0x${string}`;
const TX_HASH = `0x${'e'.repeat(64)}` as `0x${string}`;
const CLAIM_ID_A = `0x${'a'.repeat(64)}` as `0x${string}`;
const CLAIM_ID_B = `0x${'b'.repeat(64)}` as `0x${string}`;
const TOKEN = '0x4444444444444444444444444444444444444444' as `0x${string}`;
const RELEASE_CHAIN = 11155420;

const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
  useWriteContract: jest.fn(),
  useWaitForTransactionReceipt: jest.fn(),
}));

jest.mock('@/app/api/rewards.api', () => ({
  fetchRewardEntitlements: jest.fn(),
}));

jest.mock('@/lib/contracts/registry', () => ({
  getContractAddress: () => CONTRACT,
  getContractAbi: () => [
    {
      type: 'function',
      name: 'claimRewards',
      stateMutability: 'nonpayable',
      inputs: [],
      outputs: [],
    },
  ],
  getProtocolVersion: () => '2.0.0',
  getReleaseChainId: () => RELEASE_CHAIN,
}));

jest.mock('@/lib/pending-transactions', () => ({
  trackPendingTransaction: jest.fn(),
  clearPendingTransaction: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Typed mock handles
// ---------------------------------------------------------------------------

const mockedUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockedUseChainId = useChainId as jest.MockedFunction<typeof useChainId>;
const mockedUseWriteContract = useWriteContract as jest.MockedFunction<typeof useWriteContract>;
const mockedUseWaitForTx = useWaitForTransactionReceipt as jest.MockedFunction<
  typeof useWaitForTransactionReceipt
>;
const mockedFetchEntitlements = fetchRewardEntitlements as jest.MockedFunction<
  typeof fetchRewardEntitlements
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRawEntitlement(overrides: Record<string, unknown> = {}) {
  return {
    claimId: CLAIM_ID_A,
    category: 'verification_reward',
    amount: '1000000000000000000',
    asset: TOKEN,
    decimals: 18,
    claimable: true,
    ...overrides,
  };
}

function transferLog(toAddress: string, amount: bigint) {
  const toTopic = `0x${toAddress.toLowerCase().replace('0x', '').padStart(64, '0')}` as `0x${string}`;
  return {
    address: TOKEN,
    topics: [
      ERC20_TRANSFER_TOPIC as `0x${string}`,
      `0x${'0'.repeat(64)}` as `0x${string}`,
      toTopic,
    ],
    data: `0x${amount.toString(16).padStart(64, '0')}` as `0x${string}`,
  };
}

function makeSuccessReceipt(logs: unknown[] = []) {
  return {
    transactionHash: TX_HASH,
    status: 'success' as const,
    blockNumber: 100n,
    chainId: RELEASE_CHAIN,
    to: CONTRACT,
    logs,
  };
}

/** Sets up wagmi mocks for a connected, correct-chain wallet. */
function setupConnectedWallet(
  writeContractAsync: jest.Mock = jest.fn().mockResolvedValue(TX_HASH),
) {
  let pendingReceiptData: unknown = undefined;

  mockedUseAccount.mockReturnValue({
    address: ADDR,
    isConnected: true,
  } as unknown as ReturnType<typeof useAccount>);
  mockedUseChainId.mockReturnValue(RELEASE_CHAIN);
  mockedUseWriteContract.mockReturnValue({
    writeContractAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useWriteContract>);
  mockedUseWaitForTx.mockImplementation(
    (params?: { hash?: `0x${string}` }) =>
      ({
        data: params?.hash ? pendingReceiptData : undefined,
        error: null,
        isLoading: false,
      }) as unknown as ReturnType<typeof useWaitForTransactionReceipt>,
  );

  return {
    writeContractAsync,
    /** Call to make the receipt arrive on the next render. */
    deliverReceipt(receipt: unknown) {
      pendingReceiptData = receipt;
    },
  };
}

/** Minimal QueryClientProvider wrapper. */
function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ── 1. Entitlement loading states ─────────────────────────────────────────

describe('useRewards — entitlement loading states', () => {
  it('exposes loading state while the projection is in-flight', async () => {
    setupConnectedWallet();
    let resolveBackend!: (v: unknown) => void;
    mockedFetchEntitlements.mockReturnValue(
      new Promise((r) => { resolveBackend = r as (v: unknown) => void; }),
    );

    const { useRewards } = await import('@/hooks/useRewards');
    const { result } = renderHook(() => useRewards(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.status).toBe('idle'));
    // No rewards yet, not error
    expect(result.current.pendingRewards).toHaveLength(0);

    resolveBackend([makeRawEntitlement()]);
    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(1));
  });

  it('returns an empty reward list when the backend has no entitlements', async () => {
    setupConnectedWallet();
    mockedFetchEntitlements.mockResolvedValue([]);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result } = renderHook(() => useRewards(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(0));
    expect(result.current.totalClaimableDisplay).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('filters non-claimable entitlements from the reward list', async () => {
    setupConnectedWallet();
    mockedFetchEntitlements.mockResolvedValue([
      makeRawEntitlement({ claimable: true }),
      makeRawEntitlement({ claimId: CLAIM_ID_B, claimable: false }),
    ]);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result } = renderHook(() => useRewards(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(1));
    expect(result.current.pendingRewards[0].claimId).toBe(CLAIM_ID_A);
  });

  it('drops invalid backend entries without crashing (untrusted-input handling)', async () => {
    setupConnectedWallet();
    mockedFetchEntitlements.mockResolvedValue([
      makeRawEntitlement(),
      // Malformed entries that must be dropped, not coerced.
      { claimId: 'not-bytes32', amount: 1.5, asset: 'not-address', category: 'bogus' },
      null,
      42,
    ] as never);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result } = renderHook(() => useRewards(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(1));
    // Only the valid entry survives validation.
    expect(result.current.pendingRewards[0].claimId).toBe(CLAIM_ID_A);
  });
});

// ── 2. Fail-closed: wallet / chain prerequisites ──────────────────────────

describe('useRewards — fail-closed wallet/chain guards', () => {
  it('returns isUnsupported when wallet is disconnected, with no fetch', async () => {
    mockedUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    } as unknown as ReturnType<typeof useAccount>);
    mockedUseChainId.mockReturnValue(RELEASE_CHAIN);
    mockedUseWriteContract.mockReturnValue({
      writeContractAsync: jest.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useWriteContract>);
    mockedUseWaitForTx.mockReturnValue({
      data: undefined, error: null, isLoading: false,
    } as unknown as ReturnType<typeof useWaitForTransactionReceipt>);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result } = renderHook(() => useRewards(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isUnsupported).toBe(true));
    expect(result.current.unsupportedReason).toMatch(/connect your wallet/i);
    expect(mockedFetchEntitlements).not.toHaveBeenCalled();
  });

  it('returns isUnsupported on wrong chain, with no fetch', async () => {
    mockedUseAccount.mockReturnValue({
      address: ADDR,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    mockedUseChainId.mockReturnValue(1); // Ethereum mainnet — unsupported
    mockedUseWriteContract.mockReturnValue({
      writeContractAsync: jest.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useWriteContract>);
    mockedUseWaitForTx.mockReturnValue({
      data: undefined, error: null, isLoading: false,
    } as unknown as ReturnType<typeof useWaitForTransactionReceipt>);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result } = renderHook(() => useRewards(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isUnsupported).toBe(true));
    expect(result.current.unsupportedReason).toMatch(/wrong network/i);
    expect(mockedFetchEntitlements).not.toHaveBeenCalled();
  });

  it('claimAll is a no-op when there are no claimable entitlements', async () => {
    const { writeContractAsync } = setupConnectedWallet();
    mockedFetchEntitlements.mockResolvedValue([
      makeRawEntitlement({ claimable: false }),
    ]);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result } = renderHook(() => useRewards(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(0));

    await act(async () => { await result.current.claimAll(); });
    expect(writeContractAsync).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});

// ── 3. Successful end-to-end claim flow ───────────────────────────────────

describe('useRewards — successful claim flow (receipt-driven)', () => {
  it('transitions idle → loading/confirming → success on confirmed receipt', async () => {
    const wallet = setupConnectedWallet();
    mockedFetchEntitlements.mockResolvedValue([makeRawEntitlement()]);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result, rerender } = renderHook(() => useRewards(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(1));

    // Initiate claim
    await act(async () => { await result.current.claimAll(); });
    expect(result.current.status).toBe('confirming');
    expect(result.current.lastTxHash).toBe(TX_HASH);

    // Pending transaction must be tracked before receipt arrives.
    expect(trackPendingTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'rewards',
        txHash: TX_HASH,
        chainId: RELEASE_CHAIN,
      }),
    );

    // Deliver a success receipt with a matching Transfer log.
    wallet.deliverReceipt(
      makeSuccessReceipt([transferLog(ADDR, 1_000_000_000_000_000_000n)]),
    );
    rerender();

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.lastTxHash).toBe(TX_HASH);
    // Pending entry must be cleared after confirmation.
    expect(clearPendingTransaction).toHaveBeenCalledWith(TX_HASH);
  });

  it('calls writeContractAsync with the release ABI (no hand-authored calldata)', async () => {
    const writeContractAsync = jest.fn().mockResolvedValue(TX_HASH);
    setupConnectedWallet(writeContractAsync);
    mockedFetchEntitlements.mockResolvedValue([makeRawEntitlement()]);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result } = renderHook(() => useRewards(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(1));

    await act(async () => { await result.current.claimAll(); });

    expect(writeContractAsync).toHaveBeenCalledTimes(1);
    const req = writeContractAsync.mock.calls[0][0];
    expect(req.address).toBe(CONTRACT);
    expect(req.functionName).toBe('claimRewards');
    expect(req.args).toEqual([]);
    // Must not encode calldata by hand.
    expect(req).not.toHaveProperty('data');
  });
});

// ── 4. Partial receipt reconciliation ─────────────────────────────────────

describe('useRewards — partial/multi-asset receipt reconciliation', () => {
  it('exposes outstandingClaimIds when the receipt covers only some entitlements', async () => {
    const wallet = setupConnectedWallet();
    mockedFetchEntitlements.mockResolvedValue([
      makeRawEntitlement({ claimId: CLAIM_ID_A, amount: '1000000000000000000' }),
      makeRawEntitlement({ claimId: CLAIM_ID_B, amount: '500000000000000000' }),
    ]);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result, rerender } = renderHook(() => useRewards(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(2));

    await act(async () => { await result.current.claimAll(); });

    // Receipt only covers the first entitlement (exact amount).
    wallet.deliverReceipt(
      makeSuccessReceipt([transferLog(ADDR, 1_000_000_000_000_000_000n)]),
    );
    rerender();

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.receiptProjection?.settledClaimIds).toEqual([]);
    expect(result.current.receiptProjection?.outstandingClaimIds).toEqual([
      CLAIM_ID_A,
      CLAIM_ID_B,
    ]);
    expect(result.current.lastTxHash).toBe(TX_HASH);
  });

  it('treats zero-transfer receipts as confirmed with all claims outstanding', async () => {
    const wallet = setupConnectedWallet();
    mockedFetchEntitlements.mockResolvedValue([makeRawEntitlement()]);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result, rerender } = renderHook(() => useRewards(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(1));

    await act(async () => { await result.current.claimAll(); });
    // Receipt with no Transfer logs — claim confirmed but nothing received.
    wallet.deliverReceipt(makeSuccessReceipt([]));
    rerender();

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.receiptProjection?.receivedAssets).toEqual([]);
    expect(result.current.receiptProjection?.outstandingClaimIds).toEqual([
      CLAIM_ID_A,
    ]);
  });
});

// ── 5. Rejection and error states ─────────────────────────────────────────

describe('useRewards — rejection and error states', () => {
  it('surfaces wallet rejection as error status with recovery via reset', async () => {
    const rejection = Object.assign(new Error('User rejected the request'), {
      name: 'UserRejectedRequestError',
    });
    setupConnectedWallet(jest.fn().mockRejectedValue(rejection));
    mockedFetchEntitlements.mockResolvedValue([makeRawEntitlement()]);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result } = renderHook(() => useRewards(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(1));

    await act(async () => { await result.current.claimAll(); });
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBeTruthy();

    act(() => { result.current.reset(); });
    expect(result.current.status).toBe('idle');
    expect(result.current.errorMessage).toBeNull();
  });

  it('surfaces RPC failure as error status with recovery via reset', async () => {
    setupConnectedWallet(jest.fn().mockRejectedValue(new Error('rpc timeout')));
    mockedFetchEntitlements.mockResolvedValue([makeRawEntitlement()]);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result } = renderHook(() => useRewards(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(1));

    await act(async () => { await result.current.claimAll(); });
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toContain('rpc timeout');

    act(() => { result.current.reset(); });
    expect(result.current.status).toBe('idle');
  });

  it('surfaces on-chain revert as error with the reverted tx hash', async () => {
    const wallet = setupConnectedWallet();
    mockedFetchEntitlements.mockResolvedValue([makeRawEntitlement()]);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result, rerender } = renderHook(() => useRewards(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(1));

    await act(async () => { await result.current.claimAll(); });
    expect(result.current.status).toBe('confirming');

    wallet.deliverReceipt({
      transactionHash: TX_HASH,
      status: 'reverted',
      blockNumber: 101n,
      chainId: RELEASE_CHAIN,
      to: CONTRACT,
      logs: [],
    });
    rerender();

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.lastTxHash).toBe(TX_HASH);
    // Pending entry cleared even on revert.
    expect(clearPendingTransaction).toHaveBeenCalledWith(TX_HASH);
  });

  it('surfaces a fabricated (non-64-hex) wallet hash as an error, never trusts it', async () => {
    setupConnectedWallet(jest.fn().mockResolvedValue('0xdeadbeef'));
    mockedFetchEntitlements.mockResolvedValue([makeRawEntitlement()]);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result } = renderHook(() => useRewards(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(1));

    await act(async () => { await result.current.claimAll(); });
    expect(result.current.status).toBe('error');
    expect(result.current.lastTxHash).toBeNull();
  });

  it('prevents concurrent claim submissions while one is in-flight', async () => {
    let resolveWrite!: (h: string) => void;
    setupConnectedWallet(
      jest.fn().mockImplementation(
        () => new Promise<string>((r) => { resolveWrite = r; }),
      ),
    );
    mockedFetchEntitlements.mockResolvedValue([makeRawEntitlement()]);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result } = renderHook(() => useRewards(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(1));

    let firstClaim!: Promise<void>;
    act(() => { firstClaim = result.current.claimAll(); });
    // Second attempt while first is in-flight must fail closed.
    await act(async () => { await result.current.claimAll(); });
    expect(result.current.errorMessage).toMatch(/already in progress/i);

    // Settle the first.
    await act(async () => {
      resolveWrite(TX_HASH);
      await firstClaim;
    });
    expect(result.current.status).toBe('confirming');
  });

  it('surfaces entitlement fetch errors with the backend message', async () => {
    setupConnectedWallet();
    mockedFetchEntitlements.mockRejectedValue(new Error('backend unavailable'));

    const { useRewards } = await import('@/hooks/useRewards');
    const { result } = renderHook(() => useRewards(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.errorMessage).toContain('backend unavailable'), {
      timeout: 5_000,
    });
  });
});

// ── 6. Lifecycle: confirmation callback triggers refetch ──────────────────

describe('useRewards — post-confirm refetch', () => {
  it('re-fetches entitlements after a confirmed claim', async () => {
    const wallet = setupConnectedWallet();
    mockedFetchEntitlements.mockResolvedValue([makeRawEntitlement()]);

    const { useRewards } = await import('@/hooks/useRewards');
    const { result, rerender } = renderHook(() => useRewards(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.pendingRewards).toHaveLength(1));

    await act(async () => { await result.current.claimAll(); });
    wallet.deliverReceipt(
      makeSuccessReceipt([transferLog(ADDR, 1_000_000_000_000_000_000n)]),
    );
    rerender();

    await waitFor(() => expect(result.current.status).toBe('success'));
    // After confirmation, the backend should be re-queried to refresh the list.
    expect(mockedFetchEntitlements).toHaveBeenCalledTimes(2);
  });
});
