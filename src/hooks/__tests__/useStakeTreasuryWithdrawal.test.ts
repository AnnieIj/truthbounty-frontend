/**
 * useStakeTreasuryWithdrawal tests (V2-FE-061).
 *
 * Verifies canonical balance reads, fail-closed gating, and per-recipient
 * outcome isolation: one rejected recipient must not block or mask another.
 */

import { renderHook, act, waitFor } from '@testing-library/react';

const ADMIN = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const;
const OTHER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as const;
const HASH_OK = (`0x${'ab'.repeat(32)}`) as `0x${string}`;

const mockSendTransaction = jest.fn();
const mockReadContract = jest.fn();
const mockWaitForReceipt = jest.fn();

// Stable identities: the hook memoizes on the ABI/client references, so a
// mock that returns a fresh object each render would cause an update loop.
const TEST_ABI = [
  {
    type: 'function',
    name: 'withdrawTreasury',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'treasuryBalance',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const mockPublicClient = {
  readContract: mockReadContract,
  waitForTransactionReceipt: mockWaitForReceipt,
};
const mockWalletClient = { sendTransaction: mockSendTransaction };
const mockRoles = { admin: ADMIN };
const mockRelease = { parameters: { minBondAmount: '1000000000000000000' } };

jest.mock('wagmi', () => ({
  useAccount: () => ({ address: ADMIN, isConnected: true }),
  useChainId: () => 11155420,
  usePublicClient: () => mockPublicClient,
  useWalletClient: () => ({ data: mockWalletClient }),
}));

jest.mock('@/lib/contracts/registry', () => ({
  getContractAbi: () => TEST_ABI,
  getContractAddress: () => '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  getReleaseChainId: () => 11155420,
  getProtocolRelease: () => mockRelease,
}));

jest.mock('@/lib/treasury/protocol-roles', () => ({
  getCanonicalRoles: () => ({ admin: ADMIN }),
}));

jest.mock('@/lib/pending-transactions', () => ({
  trackPendingTransaction: jest.fn(),
  clearPendingTransaction: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockReadContract.mockImplementation(async (args: { functionName?: string }) => {
    if (args?.functionName === 'balanceOf') return 1_000_000_000_000_000_000n;
    if (args?.functionName === 'treasuryBalance') return 10_000_000_000_000_000_000n;
    return 0n;
  });
  mockWaitForReceipt.mockResolvedValue({ status: 'success', confirmations: 5n });
});

describe('useStakeTreasuryWithdrawal', () => {
  it('reads reserved and unlocked canonical balances', async () => {
    const { useStakeTreasuryWithdrawal } = await import('../useStakeTreasuryWithdrawal');
    const { result } = renderHook(() => useStakeTreasuryWithdrawal());

    await waitFor(() => expect(result.current.balance).not.toBeNull());

    expect(result.current.balance?.reservedWei).toBe('1000000000000000000');
    expect(result.current.balance?.unlockedWei).toBe('10000000000000000000');
    expect(result.current.gate.isAdmin).toBe(true);
    expect(result.current.gate.blockReason).toBeNull();
  });

  it('isolates a rejected recipient from a confirmed one', async () => {
    mockSendTransaction
      .mockResolvedValueOnce(HASH_OK)
      .mockRejectedValueOnce(new Error('User rejected the request'));

    const { useStakeTreasuryWithdrawal } = await import('../useStakeTreasuryWithdrawal');
    const { result } = renderHook(() => useStakeTreasuryWithdrawal());

    await waitFor(() => expect(result.current.balance).not.toBeNull());

    act(() => {
      result.current.updateRecipient(result.current.recipients[0].id, {
        recipient: ADMIN,
        amountWei: '1000',
      });
    });
    act(() => {
      result.current.addRecipient();
    });
    await waitFor(() => expect(result.current.recipients).toHaveLength(2));
    act(() => {
      result.current.updateRecipient(result.current.recipients[1].id, {
        recipient: OTHER,
        amountWei: '2000',
      });
    });
    await waitFor(() => expect(result.current.validation.ok).toBe(true));

    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() => expect(result.current.summary.allSettled).toBe(true));

    const settled = result.current.outcomes;
    expect(settled).toHaveLength(2);
    expect(settled[0].status).toBe('finalized');
    expect(settled[0].txHash).toBe(HASH_OK);
    expect(settled[1].status).toBe('rejected');
    // No fabricated hash on the rejected row.
    expect(settled[1].txHash).toBeNull();

    expect(result.current.summary.partial).toBe(true);
    expect(result.current.summary.confirmed).toBe(1);
    expect(result.current.summary.rejected).toBe(1);
    expect(result.current.status).toBe('partial');
  });

  it('fails closed without submitting when validation fails', async () => {
    const { useStakeTreasuryWithdrawal } = await import('../useStakeTreasuryWithdrawal');
    const { result } = renderHook(() => useStakeTreasuryWithdrawal());

    await waitFor(() => expect(result.current.balance).not.toBeNull());
    // Default row is empty -> invalid.

    await act(async () => {
      await result.current.submit();
    });

    expect(mockSendTransaction).not.toHaveBeenCalled();
    expect(result.current.status).toBe('failed');
  });
});
