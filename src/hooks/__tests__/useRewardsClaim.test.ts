/**
 * useRewardsClaim (V2-FE-118).
 *
 * Hook contract: fails closed on a chain mismatch (the wallet chain differs
 * from the canonical release chain), targets the canonical chain id, derives
 * finality thresholds from chain config, and never submits a write when a claim
 * is not eligible.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import {
  useAccount,
  useBlockNumber,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { useRewardsClaim } from '@/hooks/useRewardsClaim';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
  useWriteContract: jest.fn(),
  useWaitForTransactionReceipt: jest.fn(),
  useBlockNumber: jest.fn(),
}));

const mockedUseAccount = useAccount as jest.Mock;
const mockedUseChainId = useChainId as jest.Mock;
const mockedUseWriteContract = useWriteContract as jest.Mock;
const mockedUseWaitForTransactionReceipt = useWaitForTransactionReceipt as jest.Mock;
const mockedUseBlockNumber = useBlockNumber as jest.Mock;

const WALLET = '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E';
const RELEASE_CHAIN = 11155420;
const HASH = `0x${'11'.repeat(32)}` as `0x${string}`;
const mockWriteContractAsync = jest.fn();

function mockRewards(rows: unknown[]) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => rows,
  });
}

describe('useRewardsClaim', () => {
  beforeEach(() => {
    mockedUseAccount.mockReturnValue({ address: WALLET, isConnected: true });
    mockedUseChainId.mockReturnValue(10);
    mockedUseWriteContract.mockReturnValue({ writeContractAsync: mockWriteContractAsync });
    mockedUseWaitForTransactionReceipt.mockReturnValue({ data: null, isLoading: false });
    mockedUseBlockNumber.mockReturnValue({ data: 100n });
    mockWriteContractAsync.mockReset();
    mockRewards([]);
  });

  it('fails closed when the wallet is on the wrong chain', async () => {
    const { result } = renderHook(() => useRewardsClaim());

    await waitFor(() => expect(result.current.status).not.toBe('loading'));

    expect(result.current.eligibility.canClaim).toBe(false);
    expect(result.current.eligibility.reason).toBe('wrong-chain');
    // The claim always targets the canonical release chain.
    expect(result.current.chainId).toBe(RELEASE_CHAIN);
    // Finality threshold comes from canonical chain config (OP Sepolia).
    expect(result.current.requiredConfirmations).toBe(4);
  });

  it('does not submit a write when ineligible', async () => {
    const { result } = renderHook(() => useRewardsClaim());

    await waitFor(() => expect(result.current.status).not.toBe('loading'));

    await act(async () => {
      await result.current.claim();
    });

    expect(mockWriteContractAsync).not.toHaveBeenCalled();
    expect(result.current.txHash).toBeNull();
  });

  it('becomes eligible on the canonical chain with claimable rewards', async () => {
    mockedUseChainId.mockReturnValue(RELEASE_CHAIN);
    mockRewards([{ id: 'r1', amount: 2 }]);

    const { result } = renderHook(() => useRewardsClaim());

    await waitFor(() => expect(result.current.rewards).toHaveLength(1));
    expect(result.current.totalClaimable).toBe(2);
    expect(result.current.eligibility.canClaim).toBe(true);
  });

  it('submits the claim to the canonical contract when eligible', async () => {
    mockedUseChainId.mockReturnValue(RELEASE_CHAIN);
    mockRewards([{ id: 'r1', amount: 2 }]);
    mockWriteContractAsync.mockResolvedValue(HASH);

    const { result } = renderHook(() => useRewardsClaim());

    await waitFor(() => expect(result.current.eligibility.canClaim).toBe(true));

    await act(async () => {
      await result.current.claim();
    });

    expect(mockWriteContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'claimRewards', chainId: RELEASE_CHAIN }),
    );
    expect(result.current.txHash).toBe(HASH);
  });
});
