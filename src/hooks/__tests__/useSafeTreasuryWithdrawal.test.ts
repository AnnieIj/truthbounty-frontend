import { renderHook, act } from '@testing-library/react';

const admin = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const;

jest.mock('wagmi', () => ({
  useAccount: () => ({ address: admin, isConnected: true }),
  useChainId: () => 11155420,
  usePublicClient: () => ({
    readContract: jest.fn(async () => 5_000_000_000_000_000_000n),
    getBalance: jest.fn(async () => 5_000_000_000_000_000_000n),
    estimateGas: jest.fn(async () => 21000n),
    waitForTransactionReceipt: jest.fn(async () => ({ status: 'success', confirmations: 1 })),
  }),
  useWalletClient: () => ({
    data: {
      sendTransaction: jest.fn(async () => '0x' + 'ab'.repeat(32)),
    },
  }),
}));

jest.mock('@/lib/contracts/registry', () => ({
  getContractAbi: () => [
    {
      type: 'function',
      name: 'treasuryBalance',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ type: 'uint256' }],
    },
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
  ],
  getContractAddress: () => '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  getReleaseChainId: () => 11155420,
}));

jest.mock('@/lib/treasury/protocol-roles', () => ({
  getCanonicalRoles: () => ({
    chainId: 11155420,
    admin: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    arbiter: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  }),
}));

jest.mock('@/lib/pending-transactions', () => ({
  trackPendingTransaction: jest.fn(),
  clearPendingTransaction: jest.fn(),
}));

describe('useSafeTreasuryWithdrawal', () => {
  it('loads balance and validates draft for admin', async () => {
    const { useSafeTreasuryWithdrawal } = await import('../useSafeTreasuryWithdrawal');
    const { result } = renderHook(() => useSafeTreasuryWithdrawal());

    await act(async () => {
      await result.current.refreshBalance();
    });

    expect(result.current.isAdmin).toBe(true);
    expect(result.current.balance?.amountWei).toBe('5000000000000000000');

    act(() => {
      result.current.setDraft({
        recipient: admin,
        amountWei: '1000',
      });
    });

    expect(result.current.validation.ok).toBe(true);

    act(() => {
      result.current.goReview();
    });
    expect(result.current.step).toBe('review');
  });

  it('requires simulation success before treating submit as ready', async () => {
    const { useSafeTreasuryWithdrawal } = await import('../useSafeTreasuryWithdrawal');
    const { result } = renderHook(() => useSafeTreasuryWithdrawal());

    await act(async () => {
      await result.current.refreshBalance();
    });

    act(() => {
      result.current.setDraft({ recipient: admin, amountWei: '1000' });
      result.current.goReview();
      result.current.goTypedConfirm();
      result.current.setTypedConfirm('WITHDRAW');
    });

    let sim;
    await act(async () => {
      sim = await result.current.simulate();
    });
    expect(sim.success).toBe(true);
    expect(sim.calldata?.startsWith('0x')).toBe(true);
  });
});
