/**
 * V2-FE-130 — Performance budget observation state machine (pure).
 *
 * Mirrors the transaction-machine conventions: a pure reducer, immutable
 * transitions, exhaustive handling, illegal transitions throw. The state is
 * ephemeral (browser measurement only) and is never persisted or fabricated.
 *
 * States:
 *   idle → measuring → within-budget | over-budget | unknown
 *   idle → unsupported | error
 *   measuring → error
 *   (terminal + idle) → measuring (via RETRY) | idle (via RESET)
 *
 * FAIL-CLOSED: closing the measurement window with ZERO measurable metrics
 * resolves to `unknown`, never to `within-budget`.
 */

import { classifyWebVitals } from '@/config/performance-budgets';
import type { PerformanceMetricName } from '@/config/performance-budgets';

export type PerformanceBudgetStatus =
  | 'idle'
  | 'measuring'
  | 'within-budget'
  | 'over-budget'
  | 'unknown'
  | 'error'
  | 'unsupported';

export type PerformanceBudgetValue = Partial<Record<PerformanceMetricName, number>>;

export interface PerformanceViolation {
  readonly name: PerformanceMetricName;
  readonly value: number;
  readonly budget: number;
}

export interface PerformanceBudgetState {
  readonly status: PerformanceBudgetStatus;
  readonly metrics: PerformanceBudgetValue;
  readonly violations: ReadonlyArray<PerformanceViolation>;
  /** Unix ms of the most recent metric, or null while nothing is recorded. */
  readonly measuredAt: number | null;
  /** Error detail, or null while not errored. */
  readonly error: string | null;
}

export class PerformanceBudgetError extends Error {
  readonly reason: 'INVALID_TRANSITION' | 'UNSUPPORTED';

  constructor(reason: 'INVALID_TRANSITION' | 'UNSUPPORTED', detail?: string) {
    super(`[PerformanceBudget] ${reason}${detail ? `: ${detail}` : ''}`);
    this.name = 'PerformanceBudgetError';
    this.reason = reason;
  }
}

function illegal(from: string, action: string): never {
  throw new PerformanceBudgetError(
    'INVALID_TRANSITION',
    `${from} + ${action} is not a legal transition`,
  );
}

export interface BudgetActionStart { readonly type: 'START' }
export interface BudgetActionMetric {
  readonly type: 'METRIC';
  readonly name: PerformanceMetricName;
  readonly value: number;
  readonly measuredAt: number;
}
export interface BudgetActionEnd { readonly type: 'END'; readonly endedAt: number }
export interface BudgetActionRetry { readonly type: 'RETRY' }
export interface BudgetActionReset { readonly type: 'RESET' }
export interface BudgetActionUnsupported { readonly type: 'UNSUPPORTED'; readonly reason: string }
export interface BudgetActionError {
  readonly type: 'ERROR';
  readonly message: string;
  readonly measuredAt: number;
}

export type PerformanceBudgetAction =
  | BudgetActionStart
  | BudgetActionMetric
  | BudgetActionEnd
  | BudgetActionRetry
  | BudgetActionReset
  | BudgetActionUnsupported
  | BudgetActionError;

export function createIdlePerformanceState(): PerformanceBudgetState {
  return {
    status: 'idle',
    metrics: {},
    violations: [],
    measuredAt: null,
    error: null,
  };
}

export function isPerformanceBudgetTerminal(
  s: PerformanceBudgetStatus,
): boolean {
  return (
    s === 'within-budget' ||
    s === 'over-budget' ||
    s === 'unknown' ||
    s === 'error' ||
    s === 'unsupported'
  );
}

function fromIdle(
  state: PerformanceBudgetState,
  action: PerformanceBudgetAction,
): PerformanceBudgetState {
  switch (action.type) {
    case 'START':
      return { ...state, status: 'measuring', error: null };
    case 'UNSUPPORTED':
      return { ...state, status: 'unsupported', error: action.reason };
    case 'RESET':
      return createIdlePerformanceState();
    case 'ERROR':
      return { ...state, status: 'error', error: action.message, measuredAt: action.measuredAt };
    default:
      return illegal(state.status, action.type);
  }
}

function fromMeasuring(
  state: PerformanceBudgetState,
  action: PerformanceBudgetAction,
): PerformanceBudgetState {
  switch (action.type) {
    case 'METRIC': {
      if (!Number.isFinite(action.value)) {
        throw new PerformanceBudgetError(
          'INVALID_TRANSITION',
          `non-finite ${action.name} value ${action.value}`,
        );
      }
      return {
        ...state,
        metrics: { ...state.metrics, [action.name]: action.value },
        measuredAt: action.measuredAt,
      };
    }
    case 'END': {
      const result = classifyWebVitals(state.metrics);
      if (result.status === 'unknown') {
        return {
          ...state,
          status: 'unknown',
          violations: [],
          measuredAt: state.measuredAt ?? action.endedAt,
        };
      }
      return {
        ...state,
        status: result.status,
        violations: result.violations,
        measuredAt: state.measuredAt ?? action.endedAt,
      };
    }
    case 'ERROR':
      return {
        ...state,
        status: 'error',
        error: action.message,
        measuredAt: action.measuredAt,
      };
    case 'RETRY':
      return createIdlePerformanceState();
    case 'RESET':
      return createIdlePerformanceState();
    case 'START':
      return state;
    default:
      return illegal(state.status, action.type);
  }
}

function fromTerminal(
  state: PerformanceBudgetState,
  action: PerformanceBudgetAction,
): PerformanceBudgetState {
  switch (action.type) {
    case 'RETRY':
      return { ...createIdlePerformanceState(), status: 'measuring' };
    case 'RESET':
      return createIdlePerformanceState();
    default:
      return illegal(state.status, action.type);
  }
}

/**
 * Pure transition function. Throws `PerformanceBudgetError` on illegal
 * transitions or non-finite metric values.
 */
export function transitionPerformanceBudget(
  state: PerformanceBudgetState,
  action: PerformanceBudgetAction,
): PerformanceBudgetState {
  switch (state.status) {
    case 'idle':
      return fromIdle(state, action);
    case 'measuring':
      return fromMeasuring(state, action);
    case 'within-budget':
    case 'over-budget':
    case 'unknown':
    case 'error':
    case 'unsupported':
      return fromTerminal(state, action);
default: {
      const _exhaustive: never = state.status;
      throw new Error(`Unknown status: ${_exhaustive}`);
    }
  }
}

/**
 * Deterministic staleness check: a measurement is stale once its last metric
 * is older than the canonical staleness window and the monitor is idle or
 * terminal (no longer collecting).
 */
export function isBudgetMeasurementStale(
  state: PerformanceBudgetState,
  now: number,
  stalenessMs: number,
): boolean {
  if (state.status === 'measuring' || state.measuredAt === null) return false;
  return now - state.measuredAt > stalenessMs;
}