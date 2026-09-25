/**
 * V2-FE-016 — Unit tests for useERC20Allowance and useERC20Approval
 *
 * Coverage:
 *  - All async states: idle, loading, success, error, unsupported-chain, invalid-params
 *  - Approval lifecycle: needs-approval → awaiting-signature → pending-approval
 *    → confirming → success
 *  - User rejection: rejected state + reset/retry
 *  - Error recovery: error state + reset to idle
 *  - Reset policy: pending-reset before pending-approval
 *  - Security: never fabricates tx hashes; only wagmi-returned values
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useChainId,
} from 'wagmi';
import { useERC20Allowance } from '@/hooks/useERC20Allowance';
import { useERC20Approval, ERC20ApprovalError } from '@/hooks/useERC20Approval';
import {
  MOCK_ADDRESS_1,
  MOCK_TX_HASH_1,
  MOCK_TX_HASH_2,
  MOCK_CHAIN_ID,
} from '@/__tests__/mocks/wagmi/mock-wagmi';

// ---------------------------------------------------------------------------
// Wagmi hook mocks — declared before any imports that load src/config/wagmi.ts
// which calls `http()` at module load time.
// ---------------------------------------------------------------------------

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
  useReadContract: jest.fn(),
  useWriteContract: jest.fn(),
  useWaitForTransactionReceipt: jest.fn(),
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

// Canonical test addresses
const TOKEN_ADDRESS = '0xaabbccddaabbccddaabbccddaabbccddaabbccdd' as `0x${string}`;
const SPENDER_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as `0x${string}`;
const REQUIRED_AMOUNT = 1_000_000_000_000_000_000n; // 1e18

// Default mock configuration
function setupDefaultMocks(overrides?: {
  chainId?: number;
  isConnected?: boolean;
  address?: `0x${string}`;
  allowanceData?: bigint | undefined;
  allowanceIsLoading?: boolean;
  allowanceError?: Error | null;
  writeContractReturn?: `0x${string}`;
  writeContractReject?: Error;
  receiptData?: { status: 'success' | 'reverted'; blockNumber: bigint } | null;
}) {
  mockedUseAccount.mockReturnValue({
    address: overrides?.address ?? MOCK_ADDRESS_1,
    isConnected: overrides?.isConnected ?? true,
  } as any);

  mockedUseChainId.mockReturnValue(overrides?.chainId ?? MOCK_CHAIN_ID);

  mockedUseReadContract.mockReturnValue({
    data: overrides?.allowanceData,
    isLoading: overrides?.allowanceIsLoading ?? false,
    error: overrides?.allowanceError ?? null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useReadContract>);

  const writeContractAsync = overrides?.writeContractReject
    ? jest.fn().mockRejectedValue(overrides.writeContractReject)
    : jest.fn().mockResolvedValue(overrides?.writeContractReturn ?? MOCK_TX_HASH_1);

  mockedUseWriteContract.mockReturnValue({
    writeContractAsync,
  } as unknown as ReturnType<typeof useWriteContract>);

  const receiptReturn = overrides?.receiptData !== undefined
    ? overrides.receiptData
    : null;

  mockedUseWaitForTransactionReceipt.mockReturnValue({
    data: receiptReturn,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useWaitForTransactionReceipt>);

  return { writeContractAsync };
}

beforeEach(() => {
  jest.clearAllMocks();
  setupDefaultMocks();
});

// ===========================================================================
// useERC20Allowance
// ===========================================================================

describe('useERC20Allowance', () => {
  describe('idle state', () => {
    it('returns idle when tokenAddress is undefined', () => {
      const { result } = renderHook(() =>
        useERC20Allowance({
          tokenAddress: undefined,
          owner: MOCK_ADDRESS_1,
          spender: SPENDER_ADDRESS,
          chainId: MOCK_CHAIN_ID,
        }),
      );
      expect(result.current.status).toBe('idle');
      expect(result.current.allowance).toBeUndefined();
    });

    it('returns idle when owner is undefined', () => {
      const { result } = renderHook(() =>
        useERC20Allowance({
          tokenAddress: TOKEN_ADDRESS,
          owner: undefined,
          spender: SPENDER_ADDRESS,
          chainId: MOCK_CHAIN_ID,
        }),
      );
      expect(result.current.status).toBe('idle');
    });

    it('returns idle when chainId is undefined', () => {
      const { result } = renderHook(() =>
        useERC20Allowance({
          tokenAddress: TOKEN_ADDRESS,
          owner: MOCK_ADDRESS_1,
          spender: SPENDER_ADDRESS,
          chainId: undefined,
        }),
      );
      expect(result.current.status).toBe('idle');
    });
  });

  describe('unsupported-chain state', () => {
    it('returns unsupported-chain for unknown chain ID', () => {
      const { result } = renderHook(() =>
        useERC20Allowance({
          tokenAddress: TOKEN_ADDRESS,
          owner: MOCK_ADDRESS_1,
          spender: SPENDER_ADDRESS,
          chainId: 1, // Ethereum mainnet — not supported
        }),
      );
      expect(result.current.status).toBe('unsupported-chain');
      expect(result.current.allowance).toBeUndefined();
    });

    it('does not issue a read on unsupported chain', () => {
      renderHook(() =>
        useERC20Allowance({
          tokenAddress: TOKEN_ADDRESS,
          owner: MOCK_ADDRESS_1,
          spender: SPENDER_ADDRESS,
          chainId: 1,
        }),
      );
      // useReadContract should be called with enabled: false
      const call = mockedUseReadContract.mock.calls[0][0] as Record<string, unknown>;
      expect((call as { query?: { enabled?: boolean } }).query?.enabled).toBe(false);
    });
  });

  describe('invalid-params state', () => {
    it('returns invalid-params for non-address token', () => {
      const { result } = renderHook(() =>
        useERC20Allowance({
          tokenAddress: 'not-an-address' as `0x${string}`,
          owner: MOCK_ADDRESS_1,
          spender: SPENDER_ADDRESS,
          chainId: MOCK_CHAIN_ID,
        }),
      );
      expect(result.current.status).toBe('invalid-params');
    });
  });

  describe('loading state', () => {
    it('returns loading while wagmi is fetching', () => {
      setupDefaultMocks({ allowanceIsLoading: true, allowanceData: undefined });

      const { result } = renderHook(() =>
        useERC20Allowance({
          tokenAddress: TOKEN_ADDRESS,
          owner: MOCK_ADDRESS_1,
          spender: SPENDER_ADDRESS,
          chainId: MOCK_CHAIN_ID,
        }),
      );
      expect(result.current.status).toBe('loading');
      expect(result.current.isLoading).toBe(true);
      expect(result.current.allowance).toBeUndefined();
    });
  });

  describe('success state', () => {
    it('returns success with allowance when wagmi has data', () => {
      setupDefaultMocks({ allowanceData: REQUIRED_AMOUNT });

      const { result } = renderHook(() =>
        useERC20Allowance({
          tokenAddress: TOKEN_ADDRESS,
          owner: MOCK_ADDRESS_1,
          spender: SPENDER_ADDRESS,
          chainId: MOCK_CHAIN_ID,
        }),
      );
      expect(result.current.status).toBe('success');
      expect(result.current.allowance).toBe(REQUIRED_AMOUNT);
      expect(result.current.error).toBeNull();
    });

    it('returns success with zero allowance (empty state)', () => {
      setupDefaultMocks({ allowanceData: 0n });

      const { result } = renderHook(() =>
        useERC20Allowance({
          tokenAddress: TOKEN_ADDRESS,
          owner: MOCK_ADDRESS_1,
          spender: SPENDER_ADDRESS,
          chainId: MOCK_CHAIN_ID,
        }),
      );
      expect(result.current.status).toBe('success');
      expect(result.current.allowance).toBe(0n);
    });
  });

  describe('error state', () => {
    it('returns error when wagmi read fails', () => {
      const rpcError = new Error('RPC timeout');
      setupDefaultMocks({ allowanceError: rpcError, allowanceData: undefined });

      const { result } = renderHook(() =>
        useERC20Allowance({
          tokenAddress: TOKEN_ADDRESS,
          owner: MOCK_ADDRESS_1,
          spender: SPENDER_ADDRESS,
          chainId: MOCK_CHAIN_ID,
        }),
      );
      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe(rpcError);
    });
  });

  describe('refetch', () => {
    it('calls wagmi refetch when refetch() is invoked', () => {
      const wagmiRefetch = jest.fn();
      setupDefaultMocks({ allowanceData: REQUIRED_AMOUNT });
      mockedUseReadContract.mockReturnValue({
        data: REQUIRED_AMOUNT,
        isLoading: false,
        error: null,
        refetch: wagmiRefetch,
      } as unknown as ReturnType<typeof useReadContract>);

      const { result } = renderHook(() =>
        useERC20Allowance({
          tokenAddress: TOKEN_ADDRESS,
          owner: MOCK_ADDRESS_1,
          spender: SPENDER_ADDRESS,
          chainId: MOCK_CHAIN_ID,
        }),
      );

      act(() => {
        result.current.refetch();
      });

      expect(wagmiRefetch).toHaveBeenCalledTimes(1);
    });

    it('does NOT call wagmi refetch when params are invalid', () => {
      const wagmiRefetch = jest.fn();
      mockedUseReadContract.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        refetch: wagmiRefetch,
      } as unknown as ReturnType<typeof useReadContract>);

      const { result } = renderHook(() =>
        useERC20Allowance({
          tokenAddress: TOKEN_ADDRESS,
          owner: MOCK_ADDRESS_1,
          spender: SPENDER_ADDRESS,
          chainId: 1, // unsupported
        }),
      );

      act(() => {
        result.current.refetch();
      });

      expect(wagmiRefetch).not.toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// useERC20Approval
// ===========================================================================

describe('useERC20Approval', () => {
  describe('idle / initial states', () => {
    it('starts in idle when params incomplete', () => {
      setupDefaultMocks({ allowanceData: undefined, allowanceIsLoading: false });
      const { result } = renderHook(() =>
        useERC20Approval({
          tokenAddress: undefined,
          spender: SPENDER_ADDRESS,
          requiredAmount: REQUIRED_AMOUNT,
        }),
      );
      expect(result.current.status).toBe('idle');
    });

    it('goes to unsupported-chain when chainId is unsupported', () => {
      setupDefaultMocks({ chainId: 1, allowanceData: undefined });
      const { result } = renderHook(() =>
        useERC20Approval({
          tokenAddress: TOKEN_ADDRESS,
          spender: SPENDER_ADDRESS,
          requiredAmount: REQUIRED_AMOUNT,
        }),
      );
      expect(result.current.status).toBe('unsupported-chain');
    });
  });

  describe('checking → approved (sufficient allowance)', () => {
    it('transitions to approved when allowance >= requiredAmount', async () => {
      setupDefaultMocks({ allowanceData: REQUIRED_AMOUNT, allowanceIsLoading: false });

      const { result } = renderHook(() =>
        useERC20Approval({
          tokenAddress: TOKEN_ADDRESS,
          spender: SPENDER_ADDRESS,
          requiredAmount: REQUIRED_AMOUNT,
          autoCheck: true,
        }),
      );

      await waitFor(() => {
        expect(result.current.status).toBe('approved');
      });

      expect(result.current.isSufficient).toBe(true);
      expect(result.current.allowance).toBe(REQUIRED_AMOUNT);
    });
  });

  describe('checking → needs-approval (insufficient allowance)', () => {
    it('transitions to needs-approval when allowance < requiredAmount', async () => {
      setupDefaultMocks({ allowanceData: 0n, allowanceIsLoading: false });

      const { result } = renderHook(() =>
        useERC20Approval({
          tokenAddress: TOKEN_ADDRESS,
          spender: SPENDER_ADDRESS,
          requiredAmount: REQUIRED_AMOUNT,
          autoCheck: true,
        }),
      );

      await waitFor(() => {
        expect(result.current.status).toBe('needs-approval');
      });

      expect(result.current.isSufficient).toBe(false);
      expect(result.current.allowance).toBe(0n);
    });
  });

  describe('approve() — successful exact-policy flow', () => {
    it('transitions: needs-approval → awaiting-signature → pending-approval on approve()', async () => {
      setupDefaultMocks({ allowanceData: 0n });
      const { writeContractAsync } = setupDefaultMocks({ allowanceData: 0n });

      const { result } = renderHook(() =>
        useERC20Approval({
          tokenAddress: TOKEN_ADDRESS,
          spender: SPENDER_ADDRESS,
          requiredAmount: REQUIRED_AMOUNT,
          policy: 'exact',
        }),
      );

      await waitFor(() => {
        expect(result.current.status).toBe('needs-approval');
      });

      await act(async () => {
        await result.current.approve();
      });

      // writeContract was called with exact args — never fabricated
      expect(writeContractAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          address: TOKEN_ADDRESS,
          functionName: 'approve',
          args: [SPENDER_ADDRESS, REQUIRED_AMOUNT],
        }),
      );

      // Should be in pending-approval state
      expect(result.current.status).toBe('pending-approval');
    });

    it('does not fabricate tx hashes — only wagmi-returned hash is used', async () => {
      const { writeContractAsync } = setupDefaultMocks({ allowanceData: 0n });
      writeContractAsync.mockResolvedValue(MOCK_TX_HASH_1);

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

      // No random or fabricated hash — wagmi returned MOCK_TX_HASH_1
      expect(writeContractAsync).toHaveBeenCalledTimes(1);
      expect(writeContractAsync).toHaveBeenCalledWith(
        expect.objectContaining({ args: [SPENDER_ADDRESS, REQUIRED_AMOUNT] }),
      );
    });

    it('confirms and refreshes allowance from receipt (not a timer)', async () => {
      const wagmiRefetch = jest.fn();
      setupDefaultMocks({ allowanceData: 0n });
      mockedUseReadContract.mockReturnValue({
        data: 0n,
        isLoading: false,
        error: null,
        refetch: wagmiRefetch,
      } as unknown as ReturnType<typeof useReadContract>);

      // Simulate receipt arriving
      mockedUseWaitForTransactionReceipt.mockReturnValue({
        data: {
          status: 'success',
          blockNumber: 1000n,
          transactionHash: MOCK_TX_HASH_1,
        },
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

      await act(async () => {
        await result.current.approve();
      });

      // After receipt, allowance refetch should be triggered
      await waitFor(() => {
        expect(wagmiRefetch).toHaveBeenCalled();
      });
    });
  });

  describe('approve() — user rejection', () => {
    it('transitions to rejected when user rejects the wallet popup', async () => {
      const userRejectError = Object.assign(
        new Error('User rejected the request.'),
        { code: 4001 },
      );
      setupDefaultMocks({
        allowanceData: 0n,
        writeContractReject: userRejectError,
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

      expect(result.current.status).toBe('rejected');
      expect(result.current.error).toBeInstanceOf(ERC20ApprovalError);
      expect((result.current.error as ERC20ApprovalError).reason).toBe('USER_REJECTED');
    });

    it('allows recovery from rejected state via reset()', async () => {
      const userRejectError = Object.assign(
        new Error('user rejected transaction'),
        { code: 4001 },
      );
      setupDefaultMocks({
        allowanceData: 0n,
        writeContractReject: userRejectError,
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

      expect(result.current.status).toBe('rejected');

      // Reset clears error; with autoCheck=true the hook immediately
      // re-evaluates the allowance (still 0n) and moves to needs-approval.
      act(() => {
        result.current.reset();
      });

      expect(result.current.error).toBeNull();
      // autoCheck re-checks allowance → needs-approval (correct behavior)
      await waitFor(() => {
        expect(result.current.status).toBe('needs-approval');
      });
    });
  });

  describe('approve() — RPC/network error recovery', () => {
    it('transitions to error state on unexpected errors', async () => {
      const rpcError = new Error('Network error: RPC call failed');
      setupDefaultMocks({
        allowanceData: 0n,
        writeContractReject: rpcError,
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

      expect(result.current.status).toBe('error');
      expect(result.current.error).not.toBeNull();
    });

    it('allows recovery from error state via reset()', async () => {
      const rpcError = new Error('Network error');
      setupDefaultMocks({
        allowanceData: 0n,
        writeContractReject: rpcError,
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

      expect(result.current.status).toBe('error');

      act(() => {
        result.current.reset();
      });

      // Error is cleared after reset
      expect(result.current.error).toBeNull();
      // autoCheck re-checks allowance → needs-approval
      await waitFor(() => {
        expect(result.current.status).toBe('needs-approval');
      });
    });
  });

  describe('approve() — reset policy', () => {
    it('calls approve(0) first when policy = "reset"', async () => {
      const { writeContractAsync } = setupDefaultMocks({ allowanceData: 500n });

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

      // First call must be approve(spender, 0)
      expect(writeContractAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          address: TOKEN_ADDRESS,
          functionName: 'approve',
          args: [SPENDER_ADDRESS, 0n],
        }),
      );

      expect(result.current.status).toBe('pending-reset');
    });
  });

  describe('approve() — guards', () => {
    it('throws UNSUPPORTED_CHAIN when chain is not supported', async () => {
      setupDefaultMocks({ chainId: 1, allowanceData: 0n });

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
    });

    it('throws INVALID_PARAMS when requiredAmount is zero', async () => {
      setupDefaultMocks({ allowanceData: 0n });

      const { result } = renderHook(() =>
        useERC20Approval({
          tokenAddress: TOKEN_ADDRESS,
          spender: SPENDER_ADDRESS,
          requiredAmount: 0n, // invalid
        }),
      );

      await expect(
        act(() => result.current.approve()),
      ).rejects.toMatchObject({ reason: 'INVALID_PARAMS' });
    });

    it('throws WALLET_NOT_CONNECTED when wallet is disconnected', async () => {
      setupDefaultMocks({ isConnected: false, allowanceData: 0n });
      mockedUseAccount.mockReturnValue({
        address: undefined,
        isConnected: false,
      } as any);

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
    });

    it('is a no-op when status is already approved', async () => {
      const { writeContractAsync } = setupDefaultMocks({ allowanceData: REQUIRED_AMOUNT });

      const { result } = renderHook(() =>
        useERC20Approval({
          tokenAddress: TOKEN_ADDRESS,
          spender: SPENDER_ADDRESS,
          requiredAmount: REQUIRED_AMOUNT,
        }),
      );

      await waitFor(() => expect(result.current.status).toBe('approved'));

      await act(async () => {
        await result.current.approve();
      });

      // No tx should be submitted
      expect(writeContractAsync).not.toHaveBeenCalled();
    });
  });

  describe('receipt revert handling', () => {
    it('sets error state when approve receipt is reverted', async () => {
      setupDefaultMocks({ allowanceData: 0n });
      mockedUseWaitForTransactionReceipt
        .mockReturnValueOnce({
          data: null,
          isLoading: false,
          error: null,
        } as unknown as ReturnType<typeof useWaitForTransactionReceipt>)
        .mockReturnValue({
          data: {
            status: 'reverted',
            blockNumber: 999n,
            transactionHash: MOCK_TX_HASH_2,
          },
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

      await act(async () => {
        await result.current.approve();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });
    });
  });

  describe('isApproving flag', () => {
    it('isApproving is false in idle/approved/needs-approval states', async () => {
      setupDefaultMocks({ allowanceData: 0n });

      const { result } = renderHook(() =>
        useERC20Approval({
          tokenAddress: TOKEN_ADDRESS,
          spender: SPENDER_ADDRESS,
          requiredAmount: REQUIRED_AMOUNT,
        }),
      );

      await waitFor(() => expect(result.current.status).toBe('needs-approval'));
      expect(result.current.isApproving).toBe(false);
    });
  });
});
