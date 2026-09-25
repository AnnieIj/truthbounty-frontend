/**
 * Hook tests for useRewardEntitlements — V2-FE-060
 *
 * States covered: loading, empty, loaded, error/recovery, unsupported
 * chain/wallet (fail closed), and untrusted-input rejection.
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useAccount, useChainId } from 'wagmi';

import {
  fetchRewardEntitlements,
} from '@/app/api/rewards.api';

const ADDR = '0x1111111111111111111111111111111111111111';
const RELEASE_CHAIN = 11155420;

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useChainId: jest.fn(),
}));

const mockedUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockedUseChainId = useChainId as jest.MockedFunction<typeof useChainId>;

jest.mock('@/app/api/rewards.api', () => ({
  fetchRewardEntitlements: jest.fn(),
}));
const mockedFetch = fetchRewardEntitlements as jest.MockedFunction<
  typeof fetchRewardEntitlements
>;

jest.mock('@/lib/contracts/registry', () => ({
  getReleaseChainId: () => 11155420,
}));

const VALID_ENTITLEMENT = {
  claimId: `0x${'a'.repeat(64)}`,
  category: 'verification_reward',
  amount: '1000000000000000000',
  asset: ADDR,
  decimals: 18,
  claimable: true,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function connectedWallet() {
  mockedUseAccount.mockReturnValue({
    address: ADDR,
    isConnected: true,
  } as unknown as ReturnType<typeof useAccount>);
  mockedUseChainId.mockReturnValue(RELEASE_CHAIN);
}

beforeEach(() => {
  jest.clearAllMocks();
  connectedWallet();
});

describe('useRewardEntitlements', () => {
  it('exposes a loading state while the projection loads', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    mockedFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve as (value: unknown) => void;
      }),
    );

    const { useRewardEntitlements } = await import('../useRewardEntitlements');
    const { result } = renderHook(() => useRewardEntitlements(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(result.current.entitlements).toEqual([]);

    resolveFetch([VALID_ENTITLEMENT]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('returns an empty, valid summary for wallets with no rewards', async () => {
    mockedFetch.mockResolvedValue([]);

    const { useRewardEntitlements } = await import('../useRewardEntitlements');
    const { result } = renderHook(() => useRewardEntitlements(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entitlements).toEqual([]);
    expect(result.current.summary.hasClaimable).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('validates and canonicalizes the untrusted payload', async () => {
    mockedFetch.mockResolvedValue([VALID_ENTITLEMENT]);

    const { useRewardEntitlements } = await import('../useRewardEntitlements');
    const { result } = renderHook(() => useRewardEntitlements(), { wrapper });

    await waitFor(() => expect(result.current.entitlements).toHaveLength(1));
    const entitlement = result.current.entitlements[0];
    expect(entitlement.amount).toBe(1_000_000_000_000_000_000n);
    expect(entitlement.claimable).toBe(true);
    expect(result.current.summary.claimableByAsset[0].totalAmount).toBe(
      1_000_000_000_000_000_000n,
    );
  });

  it('drops invalid entries instead of rendering them (untrusted input)', async () => {
    mockedFetch.mockResolvedValue([
      VALID_ENTITLEMENT,
      { claimId: 'not-bytes32', amount: 1.5, asset: 'x', category: 'junk', claimable: true },
    ]);

    const { useRewardEntitlements } = await import('../useRewardEntitlements');
    const { result } = renderHook(() => useRewardEntitlements(), { wrapper });

    await waitFor(() => expect(result.current.entitlements).toHaveLength(1));
    expect(result.current.entitlements[0].claimId).toBe(
      `0x${'a'.repeat(64)}`,
    );
  });

  it('surfaces fetch errors and supports refetch recovery', async () => {
    mockedFetch.mockRejectedValue(new Error('backend unavailable'));

    const { useRewardEntitlements } = await import('../useRewardEntitlements');
    const { result } = renderHook(() => useRewardEntitlements(), { wrapper });

    // retry:1 backs off ~1s before surfacing the error; allow for that.
    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 5000,
    });
    expect(result.current.error).toContain('backend unavailable');

    // Recovery: a refetch that succeeds clears the error state.
    mockedFetch.mockResolvedValue([VALID_ENTITLEMENT]);
    await actWait(async () => {
      await result.current.refetch();
    });
    await waitFor(() => {
      expect(result.current.entitlements).toHaveLength(1);
    });
    expect(result.current.isError).toBe(false);
  });

  it('fails closed with no fetch on a wrong chain', async () => {
    mockedUseChainId.mockReturnValue(1); // Ethereum mainnet — unsupported
    mockedFetch.mockResolvedValue([VALID_ENTITLEMENT]);

    const { useRewardEntitlements } = await import('../useRewardEntitlements');
    const { result } = renderHook(() => useRewardEntitlements(), { wrapper });

    await waitFor(() => expect(result.current.isUnsupported).toBe(true));
    expect(result.current.unsupportedReason).toContain('Wrong network');
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(result.current.entitlements).toEqual([]);
  });

  it('fails closed when the wallet is disconnected', async () => {
    mockedUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    } as unknown as ReturnType<typeof useAccount>);
    mockedFetch.mockResolvedValue([VALID_ENTITLEMENT]);

    const { useRewardEntitlements } = await import('../useRewardEntitlements');
    const { result } = renderHook(() => useRewardEntitlements(), { wrapper });

    await waitFor(() => expect(result.current.isUnsupported).toBe(true));
    expect(result.current.unsupportedReason).toContain('Connect your wallet');
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

async function actWait(fn: () => Promise<unknown>) {
  await fn();
}
