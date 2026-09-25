'use client';

/**
 * V2-FE-100 — useWriteReadiness
 *
 * React composition of the pure write-gate. Surfaces wallet/chain/address/
 * allowance/simulation readiness for submit buttons with accessible reasons.
 * Fails closed: any blocking failure disables the action.
 */

import { useMemo } from 'react';
import { useAccount, useChainId } from 'wagmi';

import {
  evaluateWriteTarget,
  resolveCanonicalTargetAddress,
  resolveExpectedChainId,
  type WriteGateFailure,
  type WriteGateInput,
  type WriteGateResult,
} from '@/lib/contracts/write-gate';

export interface UseWriteReadinessOptions {
  /** Expected chain id; defaults to release manifest chain. */
  expectedChainId?: number;
  /** Target contract address; defaults to canonical release address. */
  targetAddress?: string | null;
  /** Allow Hardhat/Anvil 31337 (local development only). */
  allowLocalDev?: boolean;
  /** Require target to match the canonical release contract address. */
  requireCanonicalMatch?: boolean;
  /** Override connected account (tests / non-wagmi hosts). */
  accountOverride?: string | null;
  /** Override wallet chain id (tests / non-wagmi hosts). */
  chainIdOverride?: number | null;
  /** ERC-20 allowance requirement, when the action spends tokens. */
  allowance?: WriteGateInput['allowance'];
  /** Simulation status, when the action requires a pre-send simulation. */
  simulation?: WriteGateInput['simulation'];
  /** Receipt status, when tracking an in-flight write. */
  receipt?: WriteGateInput['receipt'];
  /** Disable the gate entirely (e.g. read-only views). Default: enabled. */
  enabled?: boolean;
}

export interface UseWriteReadinessReturn extends WriteGateResult {
  /** Convenience: true only when every blocking check passes. */
  isReady: boolean;
  /** Convenience: primary failure code, or null when ready. */
  primaryCode: WriteGateFailure['code'] | null;
  /** All failure codes for analytics/tests. */
  codes: ReadonlyArray<WriteGateFailure['code']>;
  /** Human-readable reason for aria-describedby / button labels. */
  message: string | null;
  /** Connected account (echo). */
  account: string | null;
  /** Wallet chain id (echo). */
  chainId: number | null;
  /** Expected chain id used by the gate. */
  expectedChainId: number;
  /** Canonical target address used by the gate. */
  targetAddress: string | null;
}

const READY: WriteGateResult = {
  ready: true,
  failures: [],
  reason: null,
};

/**
 * Evaluate write readiness from live wallet state + optional action inputs.
 */
export function useWriteReadiness(
  options: UseWriteReadinessOptions = {},
): UseWriteReadinessReturn {
  const {
    expectedChainId: expectedOption,
    targetAddress: targetOption,
    allowLocalDev = false,
    requireCanonicalMatch = false,
    accountOverride,
    chainIdOverride,
    allowance,
    simulation,
    receipt,
    enabled = true,
  } = options;

  const account = useAccount();
  const chainId = useChainId();

  const effectiveAccount =
    accountOverride !== undefined ? accountOverride : (account.address ?? null);
  const effectiveChainId =
    chainIdOverride !== undefined ? chainIdOverride : chainId;

  const expectedChainId = useMemo(
    () => expectedOption ?? resolveExpectedChainId() ?? 10,
    [expectedOption],
  );

  const targetAddress = useMemo(
    () =>
      targetOption !== undefined
        ? targetOption
        : resolveCanonicalTargetAddress(),
    [targetOption],
  );

  const result = useMemo<WriteGateResult>(() => {
    if (!enabled) return READY;
    return evaluateWriteTarget({
      account: effectiveAccount,
      chainId: effectiveChainId,
      expectedChainId,
      targetAddress,
      allowance: allowance ?? null,
      simulation: simulation ?? null,
      receipt: receipt ?? null,
      allowLocalDev,
      requireCanonicalMatch,
    });
  }, [
    enabled,
    effectiveAccount,
    effectiveChainId,
    expectedChainId,
    targetAddress,
    allowance,
    simulation,
    receipt,
    allowLocalDev,
    requireCanonicalMatch,
  ]);

  const primary = result.failures[0] ?? null;

  return {
    ...result,
    isReady: result.ready,
    primaryCode: primary?.code ?? null,
    codes: result.failures.map((f) => f.code),
    message: result.reason,
    account: typeof effectiveAccount === 'string' ? effectiveAccount : null,
    chainId: effectiveChainId ?? null,
    expectedChainId,
    targetAddress,
  };
}
