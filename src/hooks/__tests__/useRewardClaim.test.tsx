/**
 * Hook tests for useRewardClaim — V2-FE-060
 *
 * Transaction-affecting coverage: fail-closed guards, submission flow,
 * user rejection, revert handling, receipt-driven confirmation, and reset
 * recovery. Wagmi is mocked at the hook boundary; the flow under test is
 * this hook's own validation and reconciliation logic.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import type { RewardEntitlement } from '@/app/types/rewards';
import { validateRewardEntitlement } from '@/lib/rewards/validate-entitlements';

const ADDR = '0x1111111111111111111111111111111111111111';
const CONTRACT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const TX_HASH = `0x${'e'.repeat(64)}` as `0x${string}`;
const CLAIM_ID = `0x${'a'.repeat(64)}` as `0x${string}`;
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
  useWriteContract: jest.fn(),
  useWaitForTransactionReceipt: jest.fn(),
}));

const mockedUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockedUseChainId = useChainId as jest.MockedFunction<typeof useChainId>;
const mockedUseWriteContract = useWriteContract as jest.MockedFunction<
  typeof useWriteContract
>;
const mockedUseWaitForTx = useWaitForTransactionReceipt as jest.MockedFunction<
  typeof useWaitForTransactionReceipt
>;

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
  getReleaseChainId: () => 11155420,
}));

jest.mock('@/lib/pending-transactions', () => ({
  trackPendingTransaction: jest.fn(),
  clearPendingTransaction: jest.fn(),
}));

function makeEntitlement(
  overrides: Record<string, unknown> = {},
): RewardEntitlement {
  const validated = validateRewardEntitlement({
    claimId: CLAIM_ID,
    category: 'verification_reward',
    amount: '1000000000000000000',
    asset: ADDR,
    decimals: 18,
    claimable: true,
    ...overrides,
  });
  if (!validated) throw new Error('test entitlement invalid');
  return validated;
}

function connectedWallet(writeContractAsync = jest.fn().mockResolvedValue(TX_HASH)) {
  mockedUseAccount.mockReturnValue({
    address: ADDR,
    isConnected: true,
  } as unknown as ReturnType<typeof useAccount>);
  mockedUseChainId.mockReturnValue(11155420);
  mockedUseWriteContract.mockReturnValue({
    writeContractAsync,
  } as unknown as ReturnType<typeof useWriteContract>);
  // No receipt until a hash has been submitted (mirrors wagmi behavior).
  let receiptData: unknown = undefined;
  mockedUseWaitForTx.mockImplementation((params?: { hash?: `0x${string}` }) => {
    return {
      data: params?.hash ? receiptData : undefined,
      error: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useWaitForTransactionReceipt>;
  });
  return {
    writeContractAsync,
    deliverReceipt(receipt: unknown) {
      receiptData = receipt;
    },
  };
}

function successReceipt(logs: unknown[] = []) {
  return {
    transactionHash: TX_HASH,
    status: 'success',
    blockNumber: 100n,
    chainId: 11155420,
    to: CONTRACT,
    logs,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useRewardClaim — fail-closed guards', () => {
  it('refuses to submit when the wallet is disconnected', async () => {
    const { writeContractAsync } = connectedWallet();
    mockedUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    } as unknown as ReturnType<typeof useAccount>);

    const { useRewardClaim } = await import('../useRewardClaim');
    const { result } = renderHook(() => useRewardClaim());

    await act(async () => {
      await result.current.submitClaim(
        { claimIds: [CLAIM_ID] },
        [makeEntitlement()],
      );
    });

    expect(result.current.failure?.reasonCode).toBe('WALLET_NOT_CONNECTED');
    expect(result.current.status).toBe('error');
    // The wallet write itself must never be invoked.
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('refuses to submit on an unsupported chain', async () => {
    const { writeContractAsync } = connectedWallet();
    mockedUseChainId.mockReturnValue(1); // Ethereum mainnet — unsupported

    const { useRewardClaim } = await import('../useRewardClaim');
    const { result } = renderHook(() => useRewardClaim());

    await act(async () => {
      await result.current.submitClaim(
        { claimIds: [CLAIM_ID] },
        [makeEntitlement()],
      );
    });

    expect(result.current.failure?.reasonCode).toBe('UNSUPPORTED_CHAIN');
    expect(result.current.status).toBe('error');
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('refuses to submit without validated claimable entitlements', async () => {
    const { writeContractAsync } = connectedWallet();

    const { useRewardClaim } = await import('../useRewardClaim');
    const { result } = renderHook(() => useRewardClaim());

    await act(async () => {
      await result.current.submitClaim(
        { claimIds: [CLAIM_ID] },
        [makeEntitlement({ claimable: false })],
      );
    });

    expect(result.current.failure?.reasonCode).toBe(
      'NO_CLAIMABLE_ENTITLEMENTS',
    );
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('rejects malformed claim ids before any wallet interaction', async () => {
    const { writeContractAsync } = connectedWallet();

    const { useRewardClaim } = await import('../useRewardClaim');
    const { result } = renderHook(() => useRewardClaim());

    await act(async () => {
      await result.current.submitClaim(
        { claimIds: ['claim-1' as unknown as `0x${string}`] },
        [makeEntitlement()],
      );
    });

    expect(result.current.failure?.reasonCode).toBe('INVALID_REQUEST');
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('rejects duplicate or unknown claim ids before any wallet interaction', async () => {
    const { writeContractAsync } = connectedWallet();
    const unknownClaimId = `0x${'b'.repeat(64)}` as `0x${string}`;

    const { useRewardClaim } = await import('../useRewardClaim');
    const { result } = renderHook(() => useRewardClaim());

    await act(async () => {
      await result.current.submitClaim(
        { claimIds: [CLAIM_ID, CLAIM_ID] },
        [makeEntitlement()],
      );
    });
    expect(result.current.failure?.reasonCode).toBe('INVALID_REQUEST');
    expect(writeContractAsync).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.submitClaim(
        { claimIds: [unknownClaimId] },
        [makeEntitlement()],
      );
    });
    expect(result.current.failure?.reasonCode).toBe('NO_CLAIMABLE_ENTITLEMENTS');
    expect(writeContractAsync).not.toHaveBeenCalled();
  });
});

describe('useRewardClaim — submission and receipt reconciliation', () => {
  it('submits through wagmi with the release ABI and no hand-authored calldata', async () => {
    const writeContractAsync = jest.fn().mockResolvedValue(TX_HASH);
    connectedWallet(writeContractAsync);

    const { useRewardClaim } = await import('../useRewardClaim');
    const { result } = renderHook(() => useRewardClaim());

    await act(async () => {
      await result.current.submitClaim(
        { claimIds: [CLAIM_ID] },
        [makeEntitlement()],
      );
    });

    expect(writeContractAsync).toHaveBeenCalledTimes(1);
    const request = writeContractAsync.mock.calls[0][0];
    expect(request.address).toBe(CONTRACT);
    expect(request.functionName).toBe('claimRewards');
    expect(request.args).toEqual([]);
    expect(result.current.status).toBe('confirming');
    expect(result.current.txHash).toBe(TX_HASH);
  });

  it('marks the claim confirmed only when the canonical receipt arrives', async () => {
    const { deliverReceipt } = connectedWallet();

    const { useRewardClaim } = await import('../useRewardClaim');
    const { result, rerender } = renderHook(() => useRewardClaim());

    await act(async () => {
      await result.current.submitClaim(
        { claimIds: [CLAIM_ID] },
        [makeEntitlement()],
      );
    });
    expect(result.current.status).toBe('confirming');
    expect(result.current.projection).toBeNull();

    // Receipt lands → status must advance (receipt-driven, not timer-driven).
    deliverReceipt(
      successReceipt([
        {
          address: ADDR,
          topics: [
            TRANSFER_TOPIC,
            `0x${'0'.repeat(64)}`,
            `0x${ADDR.replace('0x', '').toLowerCase().padStart(64, '0')}`,
          ],
          data: `0x${(1_000_000_000_000_000_000n).toString(16).padStart(64, '0')}`,
        },
      ]),
    );
    rerender();

    await waitFor(() => {
      expect(result.current.status).toBe('confirmed');
    });
    expect(result.current.projection?.transactionHash).toBe(TX_HASH);
    expect(result.current.projection?.settledClaimIds).toEqual([CLAIM_ID]);
    expect(result.current.projection?.outstandingClaimIds).toEqual([]);
  });

  it('surfaces wallet rejection as a rejected state with recovery via reset', async () => {
    const rejection = Object.assign(new Error('User rejected the request'), {
      name: 'UserRejectedRequestError',
    });
    connectedWallet(jest.fn().mockRejectedValue(rejection));

    const { useRewardClaim } = await import('../useRewardClaim');
    const { result } = renderHook(() => useRewardClaim());

    await act(async () => {
      await result.current.submitClaim(
        { claimIds: [CLAIM_ID] },
        [makeEntitlement()],
      );
    });

    expect(result.current.status).toBe('rejected');
    expect(result.current.failure?.reasonCode).toBe('USER_REJECTED');

    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.failure).toBeNull();
  });

  it('maps RPC submission failures to an error state with the message', async () => {
    connectedWallet(jest.fn().mockRejectedValue(new Error('rpc down')));

    const { useRewardClaim } = await import('../useRewardClaim');
    const { result } = renderHook(() => useRewardClaim());

    await act(async () => {
      await result.current.submitClaim(
        { claimIds: [CLAIM_ID] },
        [makeEntitlement()],
      );
    });

    expect(result.current.status).toBe('error');
    expect(result.current.failure?.reasonCode).toBe('RPC_ERROR');
    expect(result.current.failure?.reason).toContain('rpc down');
  });

  it('ignores hashes that are not canonical 64-hex values (fabrication guard)', async () => {
    connectedWallet(jest.fn().mockResolvedValue('0xdeadbeef'));

    const { useRewardClaim } = await import('../useRewardClaim');
    const { result } = renderHook(() => useRewardClaim());

    await act(async () => {
      await result.current.submitClaim(
        { claimIds: [CLAIM_ID] },
        [makeEntitlement()],
      );
    });

    expect(result.current.status).toBe('error');
    expect(result.current.txHash).toBeNull();
    expect(result.current.failure?.reason).toContain(
      'invalid transaction hash',
    );
  });

  it('refuses concurrent submissions while a claim is in flight', async () => {
    let resolveWrite: (hash: string) => void = () => {};
    connectedWallet(
      jest.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveWrite = resolve;
          }),
      ),
    );

    const { useRewardClaim } = await import('../useRewardClaim');
    const { result } = renderHook(() => useRewardClaim());

    // Fire the first submission; it stays in flight until we resolve it.
    let first: Promise<void> | undefined;
    act(() => {
      first = result.current.submitClaim(
        { claimIds: [CLAIM_ID] },
        [makeEntitlement()],
      );
    });
    expect(result.current.status).toBe('signature-requested');

    await act(async () => {
      await result.current.submitClaim(
        { claimIds: [CLAIM_ID] },
        [makeEntitlement()],
      );
    });
    expect(result.current.failure?.reasonCode).toBe('ALREADY_IN_PROGRESS');

    // Settle the first write and let the hook finish its transitions.
    await act(async () => {
      resolveWrite(TX_HASH);
      await first;
    });
    expect(result.current.status).toBe('confirming');
  });

  it('notifies onConfirmed once with the canonical projection', async () => {
    const wallet = connectedWallet();
    const onConfirmed = jest.fn();

    const { useRewardClaim } = await import('../useRewardClaim');
    const { result, rerender } = renderHook(() =>
      useRewardClaim({ onConfirmed }),
    );

    await act(async () => {
      await result.current.submitClaim(
        { claimIds: [CLAIM_ID] },
        [makeEntitlement()],
      );
    });
    expect(result.current.status).toBe('confirming');

    // Deliver a receipt with no matching Transfer logs: claim is confirmed
    // but nothing is recorded as received (partial/multi-asset reconciliation).
    wallet.deliverReceipt(successReceipt([]));
    rerender();

    await waitFor(() => {
      expect(onConfirmed).toHaveBeenCalledTimes(1);
    });
    const projection = onConfirmed.mock.calls[0][0];
    expect(projection.transactionHash).toBe(TX_HASH);
    expect(projection.receivedAssets).toEqual([]);
    expect(projection.outstandingClaimIds).toEqual([CLAIM_ID]);
  });
});
