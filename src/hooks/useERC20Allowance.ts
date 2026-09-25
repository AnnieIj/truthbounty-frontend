'use client';

/**
 * V2-FE-016 — ERC-20 Allowance Reader
 *
 * Reads the current ERC-20 allowance for (owner, spender) on a given token
 * contract using wagmi's useReadContract. Supports manual refetch so callers
 * can drive a refresh from a confirmed on-chain receipt.
 *
 * Security invariants:
 *  - chainId is validated against supported chains before any read is issued.
 *  - owner and spender addresses are validated as EVM addresses before use.
 *  - Never fabricates allowance values — only wagmi-returned data is accepted.
 *  - Fails closed: returns { status: 'unsupported-chain' } on bad chain.
 *  - No Stellar/Freighter/simulator runtime dependencies.
 */

import { useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { parseAbi, isAddress } from 'viem';
import { isSupportedChain } from '@/config/wagmi';

// ---------------------------------------------------------------------------
// ABI — ERC-20 allowance (read-only)
// ---------------------------------------------------------------------------

export const ERC20_ALLOWANCE_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AllowanceStatus =
  | 'idle'              // params not yet provided / hook disabled
  | 'unsupported-chain' // chainId not in supported set — fail closed
  | 'invalid-params'    // address validation failed
  | 'loading'           // wagmi query in-flight
  | 'error'             // wagmi read failed
  | 'success';          // allowance returned

export interface UseERC20AllowanceParams {
  /** ERC-20 token contract address. */
  tokenAddress: `0x${string}` | undefined;
  /** Wallet address whose allowance is being read. */
  owner: `0x${string}` | undefined;
  /** Spender contract address (e.g. TruthBountyWeighted). */
  spender: `0x${string}` | undefined;
  /** Connected chain ID. Must be in supported set. */
  chainId: number | undefined;
  /**
   * Refetch interval in ms.
   * Pass 0 or undefined to disable polling — callers should drive refresh via
   * the returned `refetch` function after receipt confirmation instead.
   * Default: disabled (0).
   */
  refetchInterval?: number;
}

export interface UseERC20AllowanceResult {
  /** Discriminated status value. */
  status: AllowanceStatus;
  /** Current allowance in wei. Undefined until a successful read. */
  allowance: bigint | undefined;
  /** True while wagmi is fetching. */
  isLoading: boolean;
  /** Error from wagmi read, if any. */
  error: Error | null;
  /**
   * Trigger an immediate re-read.
   * Call this after a confirmed Approval receipt to sync state from chain.
   */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useERC20Allowance({
  tokenAddress,
  owner,
  spender,
  chainId,
  refetchInterval,
}: UseERC20AllowanceParams): UseERC20AllowanceResult {
  // Validate addresses upfront so we can fail closed.
  const paramsValid = useMemo(() => {
    if (!tokenAddress || !owner || !spender) return false;
    return (
      isAddress(tokenAddress) && isAddress(owner) && isAddress(spender)
    );
  }, [tokenAddress, owner, spender]);

  const chainSupported = chainId !== undefined && isSupportedChain(chainId);

  // Compute the enabled flag: only read when params are valid + chain is good.
  const enabled = paramsValid && chainSupported;

  const {
    data,
    isLoading,
    error,
    refetch: wagmiRefetch,
  } = useReadContract({
    address: enabled ? (tokenAddress as `0x${string}`) : undefined,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: 'allowance',
    args:
      enabled
        ? [owner as `0x${string}`, spender as `0x${string}`]
        : undefined,
    query: {
      enabled,
      refetchInterval: refetchInterval ?? 0,
      // Never stale-while-revalidate on allowance — we want exact on-chain state.
      staleTime: 0,
    },
  });

  const refetch = () => {
    if (enabled) wagmiRefetch();
  };

  // Derive status from wagmi state
  let status: AllowanceStatus;
  if (!tokenAddress || !owner || !spender || chainId === undefined) {
    status = 'idle';
  } else if (!chainSupported) {
    status = 'unsupported-chain';
  } else if (!paramsValid) {
    status = 'invalid-params';
  } else if (isLoading) {
    status = 'loading';
  } else if (error) {
    status = 'error';
  } else if (data !== undefined) {
    status = 'success';
  } else {
    // enabled but no data yet (first render before fetch starts)
    status = 'loading';
  }

  return {
    status,
    allowance: data as bigint | undefined,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
