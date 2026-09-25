/**
 * V2-FE-059 — Pure helpers for appeal round progression, bond/deadline
 * derivation, and stale-round guards. Side-effect free for unit testing.
 */

import { encodeFunctionData, keccak256, toBytes, pad, isHex, toHex } from 'viem';
import {
  APPEAL_ROUND_STATE,
  appealParticipationAbi,
} from '@/config/protocol/appeal-artifact';
import type { AppealDecision } from '@/app/types/appeal';

export interface OnChainAppealRound {
  roundNumber: bigint;
  requiredBond: bigint;
  deadline: bigint;
  supportStake: bigint;
  opposeStake: bigint;
  state: number;
  claimId: `0x${string}`;
}

export interface AppealRoundProgression {
  appealId: `0x${string}`;
  roundNumber: number;
  requiredBond: string;
  deadlineSeconds: number;
  timeRemainingSeconds: number;
  supportStake: string;
  opposeStake: string;
  state: 'NOT_STARTED' | 'ACTIVE' | 'ENDED' | 'SETTLED' | 'UNKNOWN';
  isActive: boolean;
  hasEnded: boolean;
  /** True when the local expected round still matches on-chain. */
  roundMatchesExpected: boolean;
  expectedRound: number;
}

export interface StaleRoundCheck {
  isStale: boolean;
  onChainRound: number;
  expectedRound: number;
  reason?: string;
}

/**
 * Normalize an appeal id string into a bytes32 hex value.
 * Accepts 0x-prefixed 32-byte hex, or hashes arbitrary labels (fail closed
 * only when the result would be empty).
 */
export function toAppealIdBytes32(appealId: string): `0x${string}` {
  const trimmed = appealId.trim();
  if (!trimmed) {
    throw new Error('Appeal id is empty');
  }
  if (isHex(trimmed) && trimmed.length === 66) {
    return trimmed.toLowerCase() as `0x${string}`;
  }
  if (isHex(trimmed) && trimmed.length < 66) {
    return pad(trimmed as `0x${string}`, { size: 32 });
  }
  // Label / numeric: deterministic keccak of UTF-8 bytes (never invents random ids)
  return keccak256(toBytes(trimmed));
}

export function decisionToSupport(decision: AppealDecision): boolean {
  return decision === 'SUPPORT';
}

export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function mapAppealRoundState(
  state: number
): AppealRoundProgression['state'] {
  switch (state) {
    case APPEAL_ROUND_STATE.NOT_STARTED:
      return 'NOT_STARTED';
    case APPEAL_ROUND_STATE.ACTIVE:
      return 'ACTIVE';
    case APPEAL_ROUND_STATE.ENDED:
      return 'ENDED';
    case APPEAL_ROUND_STATE.SETTLED:
      return 'SETTLED';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Build a round-progression projection from a canonical on-chain round
 * tuple. Lifecycle flags are driven by deadline + state — never by timers
 * alone when the on-chain state already says ENDED/SETTLED.
 */
export function buildAppealRoundProgression(args: {
  appealId: `0x${string}`;
  round: OnChainAppealRound;
  expectedRound: number;
  nowSeconds?: number;
}): AppealRoundProgression {
  const now = args.nowSeconds ?? nowInSeconds();
  const deadlineSeconds = Number(args.round.deadline);
  const timeRemainingSeconds = Math.max(0, deadlineSeconds - now);
  const mapped = mapAppealRoundState(args.round.state);
  const isActive =
    mapped === 'ACTIVE' && timeRemainingSeconds > 0;
  const hasEnded =
    mapped === 'ENDED' ||
    mapped === 'SETTLED' ||
    (mapped === 'ACTIVE' && timeRemainingSeconds === 0);
  const onChainRound = Number(args.round.roundNumber);
  const roundMatchesExpected = onChainRound === args.expectedRound;

  return {
    appealId: args.appealId,
    roundNumber: onChainRound,
    requiredBond: args.round.requiredBond.toString(),
    deadlineSeconds,
    timeRemainingSeconds,
    supportStake: args.round.supportStake.toString(),
    opposeStake: args.round.opposeStake.toString(),
    state: mapped,
    isActive,
    hasEnded,
    roundMatchesExpected,
    expectedRound: args.expectedRound,
  };
}

/**
 * Fail closed when the UI's expected round no longer matches the contract.
 * Prevents stale-round participation after escalation / round advancement.
 */
export function checkStaleRound(
  onChainRound: number | bigint,
  expectedRound: number | bigint
): StaleRoundCheck {
  const onChain = Number(onChainRound);
  const expected = Number(expectedRound);
  if (!Number.isFinite(onChain) || !Number.isFinite(expected)) {
    return {
      isStale: true,
      onChainRound: onChain,
      expectedRound: expected,
      reason: 'Round numbers are not finite',
    };
  }
  if (onChain !== expected) {
    return {
      isStale: true,
      onChainRound: onChain,
      expectedRound: expected,
      reason: `Stale round: expected ${expected}, on-chain is ${onChain}`,
    };
  }
  return {
    isStale: false,
    onChainRound: onChain,
    expectedRound: expected,
  };
}

export interface EncodeParticipateArgs {
  appealId: `0x${string}`;
  decision: AppealDecision;
  stakeAmount: bigint;
  expectedRound: bigint;
}

export interface EncodedParticipateInAppeal {
  functionName: 'participateInAppeal';
  support: boolean;
  args: [`0x${string}`, boolean, bigint, bigint];
  calldata: `0x${string}`;
}

/**
 * Encode `participateInAppeal(appealId, support, stakeAmount, expectedRound)`
 * with the versioned artifact ABI. Never uses synthetic selectors.
 */
export function encodeParticipateInAppeal(
  args: EncodeParticipateArgs
): EncodedParticipateInAppeal {
  const support = decisionToSupport(args.decision);
  const abiArgs: [`0x${string}`, boolean, bigint, bigint] = [
    args.appealId,
    support,
    args.stakeAmount,
    args.expectedRound,
  ];
  return {
    functionName: 'participateInAppeal',
    support,
    args: abiArgs,
    calldata: encodeFunctionData({
      abi: appealParticipationAbi,
      functionName: 'participateInAppeal',
      args: abiArgs,
    }),
  };
}

/**
 * Project new totals after a successful participation. Totals are arithmetic
 * over the already-canonical on-chain totals — no fabricated reward multiples.
 */
export function projectStakeTotals(args: {
  decision: AppealDecision;
  stakeAmount: bigint;
  currentSupport: bigint;
  currentOppose: bigint;
}): { newSupportTotal: string; newOpposeTotal: string; riskAmount: string } {
  const support =
    args.decision === 'SUPPORT'
      ? args.currentSupport + args.stakeAmount
      : args.currentSupport;
  const oppose =
    args.decision === 'OPPOSE'
      ? args.currentOppose + args.stakeAmount
      : args.currentOppose;
  return {
    newSupportTotal: support.toString(),
    newOpposeTotal: oppose.toString(),
    riskAmount: args.stakeAmount.toString(),
  };
}

/** Format wei bond for accessible UI without inventing decimals beyond 18. */
export function formatBondWei(wei: string | bigint, decimals = 18): string {
  const value = typeof wei === 'bigint' ? wei : BigInt(wei);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

export function formatDeadline(seconds: number): string {
  if (seconds <= 0) return 'Ended';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Stable hex helper for tests / debug — never used as a tx hash source. */
export function bytes32FromNumber(n: number | bigint): `0x${string}` {
  return toHex(BigInt(n), { size: 32 });
}
