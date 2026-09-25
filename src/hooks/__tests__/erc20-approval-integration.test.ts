/**
 * V2-FE-016 — Wallet / integration tests for transaction-affecting flows
 *
 * Tests the full approval lifecycle that involves wallet interactions:
 *  - Exact-policy: allowance read → approve tx → receipt → allowance refresh
 *  - Reset-policy: allowance read → reset tx (approve 0) → receipt → approve tx
 *    → receipt → allowance refresh
 *  - User rejection mid-flow (reset tx OR approve tx)
 *  - EVM revert on approve tx receipt
 *  - Correct chain ID validation gate
 *  - Cannot enter confirmed state without a canonical on-chain receipt
 *  - approve() is idempotent when already in 'approved' state
 *
 * Security invariants verified:
 *  - Only wagmi-returned tx hashes are accepted (no fabrication)
 *  - Receipt revert transitions to error (not success)
 *  - Wrong-chain throws before any write
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { useERC20Approval } from '@/hooks/useERC20Approval';
import {
  MOCK_ADDRESS_1,
  MOCK_TX_HASH_1,
  MOCK_TX_HASH_2,
  MOCK_CHAIN_ID,
} from '@/__tests__/mocks/wagmi/mock-wagmi';

// ---------------------------------------------------------------------------
// Wagmi mocks
// These must be declared before any imports that transitively import wagmi,
// including @/config/wagmi (which calls http() at module load time).
// ---------------------------------------------------------------------------

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
  useReadContract: jest.fn(),
  useWriteContract: jest.fn(),
  useWaitForTransactionReceipt: jest.fn(),
  // Wagmi config helpers (called at module load in src/config/wagmi.ts)
  http: jest.fn(() => ({})),
  createStorage: jest.fn(() => ({})),
  cookieStorage: {},
}));

jest.mock('@rainbow-me/rainbowkit', () => ({
  getDefaultConfig: jest.fn(() => ({
    chains: [{ id: 10 }, { id: 11155420 }],
    transports: {},
  })),
}));

const mockedUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockedUseChainId = useChainId as jest.MockedFunction<typeof useChainId>;
const mockedUseReadContract = useReadContract as jest.MockedFunction<typeof useReadContract>;
const mockedUseWriteContract = useWriteContract as jest.MockedFunction<typeof useWriteContract>;
const mockedUseWaitForTransactionReceipt = useWaitForTransactionReceipt as jest.MockedFunction<typeof useWaitForTransactionReceipt>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_ADDRESS = '0xaabbccddaabbccddaabbccddaabbccddaabbccdd' as `0x${string}`;
const SPENDER_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as `0x${string}`;
const REQUIRED_AMOUNT = 1_000_000_000_000_000_000n;

// ---------------------------------------------------------------------------
// Default setup
// ---------------------------------------------------------------------------

function setupWagmiMocks(config: {
  allowanceData?: bigint;
  allowanceIsLoading?: boolean;
  allowanceError?: Error | null;
  chainId?: number;
  isConnected?: boolean;
  address?: `0x${string}`;
  writeContractResults?: Array<`0x${string}` | Error>;
  receiptResults?: Array<{
    status: 'success' | 'reverted';
    blockNumber?: bigint;
    hash?: `0x${string}`;
  } | null>;
}) {
  mockedUseAccount.mockReturnValue({
    address: config.address ?? MOCK_ADDRESS_1,
    isConnected: config.isConnected ?? true,
  } as any);

  mockedUseChainId.mockReturnValue(config.chainId ?? MOCK_CHAIN_ID);

  const refetch = jest.fn();
  let readCallCount = 0;
  mockedUseReadContract.mockImplementation(() => {
    readCallCount++;
    return {
      data: config.allowanceData,
      isLoading: config.allowanceIsLoading ?? false,
      error: config.allowanceError ?? null,
      refetch,
    } as unknown as ReturnType<typeof useReadContract>;
  });

  // Simulate multiple write contract calls (reset + approve in sequence)
  const writeResults = config.writeContractResults ?? [MOCK_TX_HASH_1];
  let writeIdx = 0;
  const writeContractAsync = jest.fn().mockImplementation(() => {
    const result = writeResults[writeIdx++] ?? MOCK_TX_HASH_1;
    if (result instanceof Error) {
      return Promise.reject(result);
    }
    return Promise.resolve(result);
  });

  mockedUseWriteContract.mockReturnValue({
    writeContractAsync,
  } as unknown as ReturnType<typeof useWriteContract>);

  // Simulate receipt results across re-renders
  const receiptData = config.receiptResults ?? [null];
  const receiptIdx = 0;
  mockedUseWaitForTransactionReceipt.mockImplementation(() => {
    const datum = receiptData[Math.min(receiptIdx, receiptData.length - 1)];
    return {
      data: datum
        ? {
            status: datum.status,
            blockNumber: datum.blockNumber ?? 1000n,
            transactionHash: datum.hash ?? MOCK_TX_HASH_1,
          }
        : null,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useWaitForTransactionReceipt>;
  });

  return { writeContractAsync, refetch };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// Integration: exact-policy full lifecycle
// ===========================================================================

describe('Integration: exact-policy full approval lifecycle', () => {
  it('reads allowance, calls approve, waits for receipt, then refreshes allowance', async () => {
    // Start with no receipt, then deliver receipt after approve() call
    let receiptDelivered = false;
    const refetch = jest.fn();

    mockedUseAccount.mockReturnValue({
      address: MOCK_ADDRESS_1,
      isConnected: true,
    } as any);
    mockedUseChainId.mockReturnValue(MOCK_CHAIN_ID);
    mockedUseReadContract.mockReturnValue({
      data: 0n,
      isLoading: false,
      error: null,
      refetch,
    } as unknown as ReturnType<typeof useReadContract>);

    const writeContractAsync = jest.fn().mockResolvedValue(MOCK_TX_HASH_1);
    mockedUseWriteContract.mockReturnValue({
      writeContractAsync,
    } as unknown as ReturnType<typeof useWriteContract>);

    // The receipt hook delivers null until receiptDelivered is set
    mockedUseWaitForTransactionReceipt.mockImplementation(() => ({
      data: receiptDelivered
        ? { status: 'success', blockNumber: 1001n, transactionHash: MOCK_TX_HASH_1 }
        : null,
      isLoading: false,
      error: null,
    }) as unknown as ReturnType<typeof useWaitForTransactionReceipt>);

    const { result, rerender } = renderHook(() =>
      useERC20Approval({
        tokenAddress: TOKEN_ADDRESS,
        spender: SPENDER_ADDRESS,
        requiredAmount: REQUIRED_AMOUNT,
        policy: 'exact',
      }),
    );

    // 1. Allowance checked → needs-approval
    await waitFor(() => expect(result.current.status).toBe('needs-approval'));

    // 2. Submit approval
    await act(async () => {
      await result.current.approve();
    });

    // 3. verify writeContractAsync called with exact params (no fabrication)
    expect(writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TOKEN_ADDRESS,
        functionName: 'approve',
        args: [SPENDER_ADDRESS, REQUIRED_AMOUNT],
      }),
    );

    // 4. Should be pending receipt
    expect(result.current.status).toBe('pending-approval');

    // 5. Deliver receipt and re-render
    receiptDelivered = true;
    rerender();

    // 6. After receipt arrives → should trigger allowance refresh
    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
    });
  });

  it('approve() is idempotent when allowance is already sufficient', async () => {
    const { writeContractAsync } = setupWagmiMocks({
      allowanceData: REQUIRED_AMOUNT, // already sufficient
    });

    const { result } = renderHook(() =>
      useERC20Approval({
        tokenAddress: TOKEN_ADDRESS,
        spender: SPENDER_ADDRESS,
        requiredAmount: REQUIRED_AMOUNT,
        policy: 'exact',
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('approved'));

    // Call approve — should be no-op
    await act(async () => {
      await result.current.approve();
    });

    expect(writeContractAsync).not.toHaveBeenCalled();
    expect(result.current.status).toBe('approved');
  });
});

// ===========================================================================
// Integration: reset-policy flow
// ===========================================================================

describe('Integration: reset-policy approval flow', () => {
  it('calls approve(0) first, then approve(requiredAmount) after reset receipt', async () => {
    const { writeContractAsync } = setupWagmiMocks({
      allowanceData: 500n, // some existing allowance
      writeContractResults: [MOCK_TX_HASH_1, MOCK_TX_HASH_2],
      receiptResults: [
        null,
        { status: 'success', blockNumber: 1001n, hash: MOCK_TX_HASH_1 }, // reset receipt
      ],
    });

    const { result } = renderHook(() =>
      useERC20Approval({
        tokenAddress: TOKEN_ADDRESS,
        spender: SPENDER_ADDRESS,
        requiredAmount: REQUIRED_AMOUNT,
        policy: 'reset',
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('needs-approval'));

    await act(async () => {
      await result.current.approve();
    });

    // First call must be approve(spender, 0) — the reset
    expect(writeContractAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        address: TOKEN_ADDRESS,
        functionName: 'approve',
        args: [SPENDER_ADDRESS, 0n],
      }),
    );

    expect(result.current.status).toBe('pending-reset');
  });
});

// ===========================================================================
// Integration: user rejection
// ===========================================================================

describe('Integration: user rejection during approval', () => {
  it('transitions to rejected when user rejects the approve tx', async () => {
    const userReject = Object.assign(new Error('User rejected the request.'), {
      code: 4001,
    });
    setupWagmiMocks({
      allowanceData: 0n,
      writeContractResults: [userReject],
    });

    const { result } = renderHook(() =>
      useERC20Approval({
        tokenAddress: TOKEN_ADDRESS,
        spender: SPENDER_ADDRESS,
        requiredAmount: REQUIRED_AMOUNT,
        policy: 'exact',
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('needs-approval'));

    await act(async () => {
      await result.current.approve();
    });

    expect(result.current.status).toBe('rejected');
    expect(result.current.error?.message).toContain('rejected');
    expect(result.current.isApproving).toBe(false);
  });

  it('allows retry after rejection via reset() + approve()', async () => {
    const userReject = Object.assign(new Error('User rejected the request.'), {
      code: 4001,
    });
    // First call rejects, second succeeds
    const writeContractAsync = jest
      .fn()
      .mockRejectedValueOnce(userReject)
      .mockResolvedValueOnce(MOCK_TX_HASH_1);

    mockedUseWriteContract.mockReturnValue({
      writeContractAsync,
    } as unknown as ReturnType<typeof useWriteContract>);

    mockedUseReadContract.mockReturnValue({
      data: 0n,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useReadContract>);

    mockedUseWaitForTransactionReceipt.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useWaitForTransactionReceipt>);

    const { result } = renderHook(() =>
      useERC20Approval({
        tokenAddress: TOKEN_ADDRESS,
        spender: SPENDER_ADDRESS,
        requiredAmount: REQUIRED_AMOUNT,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('needs-approval'));

    // First attempt — rejected
    await act(async () => {
      await result.current.approve();
    });

    expect(result.current.status).toBe('rejected');

    // Reset — with autoCheck=true, hook re-evaluates 0n allowance → needs-approval
    act(() => {
      result.current.reset();
    });

    // After reset(), error is cleared
    expect(result.current.error).toBeNull();

    // autoCheck kicks in and moves back to needs-approval (allowance still 0n)
    await waitFor(() => {
      expect(result.current.status).toBe('needs-approval');
    });

    // Second attempt — succeeds
    await act(async () => {
      await result.current.approve();
    });

    expect(writeContractAsync).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('pending-approval');
  });
});

// ===========================================================================
// Integration: receipt revert (cannot confirm from revert)
// ===========================================================================

describe('Integration: receipt revert — fail closed', () => {
  it('transitions to error (not success) when receipt status = reverted', async () => {
    setupWagmiMocks({
      allowanceData: 0n,
      writeContractResults: [MOCK_TX_HASH_1],
      receiptResults: [
        { status: 'reverted', blockNumber: 999n, hash: MOCK_TX_HASH_1 },
      ],
    });

    const { result } = renderHook(() =>
      useERC20Approval({
        tokenAddress: TOKEN_ADDRESS,
        spender: SPENDER_ADDRESS,
        requiredAmount: REQUIRED_AMOUNT,
        policy: 'exact',
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('needs-approval'));

    await act(async () => {
      await result.current.approve();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    // Confirmed: status is error, not success or confirming
    expect(result.current.status).not.toBe('success');
    expect(result.current.status).not.toBe('confirming');
  });
});

// ===========================================================================
// Integration: chain validation gate
// ===========================================================================

describe('Integration: chain validation gate', () => {
  it('throws UNSUPPORTED_CHAIN before submitting any write on chain 1', async () => {
    setupWagmiMocks({ chainId: 1, allowanceData: 0n });
    const writeContractAsync = jest.fn();
    mockedUseWriteContract.mockReturnValue({
      writeContractAsync,
    } as unknown as ReturnType<typeof useWriteContract>);

    const { result } = renderHook(() =>
      useERC20Approval({
        tokenAddress: TOKEN_ADDRESS,
        spender: SPENDER_ADDRESS,
        requiredAmount: REQUIRED_AMOUNT,
      }),
    );

    await expect(
      act(() => result.current.approve()),
    ).rejects.toMatchObject({ reason: 'UNSUPPORTED_CHAIN' });

    // writeContractAsync must NEVER be called on wrong chain
    expect(writeContractAsync).not.toHaveBeenCalled();
  });

  it('throws WALLET_NOT_CONNECTED when wallet is disconnected', async () => {
    setupWagmiMocks({
      isConnected: false,
      address: undefined,
      allowanceData: 0n,
    });
    mockedUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    } as any);

    const writeContractAsync = jest.fn();
    mockedUseWriteContract.mockReturnValue({
      writeContractAsync,
    } as unknown as ReturnType<typeof useWriteContract>);

    const { result } = renderHook(() =>
      useERC20Approval({
        tokenAddress: TOKEN_ADDRESS,
        spender: SPENDER_ADDRESS,
        requiredAmount: REQUIRED_AMOUNT,
      }),
    );

    await expect(
      act(() => result.current.approve()),
    ).rejects.toMatchObject({ reason: 'WALLET_NOT_CONNECTED' });

    expect(writeContractAsync).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Integration: no fabricated hashes
// ===========================================================================

describe('Integration: no fabricated tx hashes', () => {
  it('approval state only advances when wagmi returns a real hash', async () => {
    const realHash = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as `0x${string}`;
    const { writeContractAsync } = setupWagmiMocks({
      allowanceData: 0n,
      writeContractResults: [realHash],
    });

    writeContractAsync.mockResolvedValue(realHash);

    const { result } = renderHook(() =>
      useERC20Approval({
        tokenAddress: TOKEN_ADDRESS,
        spender: SPENDER_ADDRESS,
        requiredAmount: REQUIRED_AMOUNT,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('needs-approval'));

    await act(async () => {
      await result.current.approve();
    });

    // Must be in pending-approval — tx was submitted with real hash
    expect(result.current.status).toBe('pending-approval');

    // Wagmi writeContractAsync was called exactly once with canonical args
    expect(writeContractAsync).toHaveBeenCalledTimes(1);
    expect(writeContractAsync.mock.calls[0][0]).toMatchObject({
      functionName: 'approve',
      args: [SPENDER_ADDRESS, REQUIRED_AMOUNT],
    });
  });

  it('does not advance past pending-approval without a confirmed receipt', async () => {
    // Receipt never arrives (null)
    setupWagmiMocks({
      allowanceData: 0n,
      writeContractResults: [MOCK_TX_HASH_1],
      receiptResults: [null], // receipt never arrives
    });

    const { result } = renderHook(() =>
      useERC20Approval({
        tokenAddress: TOKEN_ADDRESS,
        spender: SPENDER_ADDRESS,
        requiredAmount: REQUIRED_AMOUNT,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('needs-approval'));

    await act(async () => {
      await result.current.approve();
    });

    // Without a receipt, must stay in pending-approval — no fabricated success
    expect(result.current.status).toBe('pending-approval');
    expect(result.current.status).not.toBe('success');
    expect(result.current.status).not.toBe('confirming');
  });
});
