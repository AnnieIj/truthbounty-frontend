/**
 * RPC and API Fallback Boundaries — Shared Types
 * V2-FE-136
 *
 * Security invariants:
 * - Never fabricate chain state, API projections, or protocol outcomes.
 * - Fail closed on unsupported chains, missing config, or integrity uncertainty.
 * - Stale data must be labelled; never silently presented as current.
 */

// ── RPC provider health ──────────────────────────────────────────────────────

export type RpcProviderStatus =
  | 'healthy'    // Responding within latency threshold
  | 'degraded'   // Responding slowly or with intermittent errors
  | 'unhealthy'  // Consistently failing; circuit open
  | 'unknown';   // Not yet probed

export interface RpcProviderHealth {
  url: string;
  status: RpcProviderStatus;
  /** Unix ms of last successful probe. */
  lastSuccessMs: number | null;
  /** Unix ms of last failure probe. */
  lastFailureMs: number | null;
  /** Consecutive failure count (resets on success). */
  consecutiveFailures: number;
  /** Measured latency on last success (ms). */
  latencyMs: number | null;
}

/** Aggregated RPC state across all configured providers for a chain. */
export interface RpcFallbackState {
  chainId: number;
  /** URL of the provider currently in use. */
  activeUrl: string;
  /** Index into the configured rpcUrls array. */
  activeIndex: number;
  /** Per-provider health records, keyed by URL. */
  health: Record<string, RpcProviderHealth>;
  /** True when the active provider is not the primary. */
  isUsingFallback: boolean;
  /** True when ALL providers are unhealthy. */
  allUnhealthy: boolean;
  /** True when any provider is degraded (but not all unhealthy). */
  isDegraded: boolean;
  /** True when circuit is open (fail-closed, no requests forwarded). */
  circuitOpen: boolean;
  /** Unix ms when the circuit was opened, null if closed. */
  circuitOpenedAt: number | null;
}

// ── API projection layer ─────────────────────────────────────────────────────

export type ApiDataStatus =
  | 'fresh'       // Within staleTimeMs
  | 'stale'       // Beyond staleTimeMs but still usable
  | 'critical'    // Beyond criticalStaleMs; must block writes
  | 'error'       // Last fetch failed
  | 'loading'     // Initial load in progress
  | 'unavailable'; // No data and no successful fetch ever

export interface ApiProjectionState<T> {
  data: T | null;
  status: ApiDataStatus;
  /** Unix ms of last successful fetch. */
  lastFetchedMs: number | null;
  /** Age of current data in ms. */
  dataAgeMs: number | null;
  /** True when a background refresh is in flight. */
  isRefreshing: boolean;
  /** True when data is stale (status === 'stale' or 'critical'). */
  isStale: boolean;
  /** True when a write/action should be blocked due to integrity. */
  isBlocked: boolean;
  /** Last error if status === 'error'. */
  error: Error | null;
  /** Number of consecutive fetch failures. */
  consecutiveFailures: number;
}

// ── Integrity guard ──────────────────────────────────────────────────────────

export type IntegrityStatus =
  | 'valid'        // Chain + API state is fresh and consistent
  | 'degraded'     // One or more sources are stale or on fallback
  | 'blocked'      // Critical staleness or chain mismatch; block actions
  | 'error';       // Fatal integrity failure

export interface ChainIntegrityState {
  chainId: number | undefined;
  isSupported: boolean;
  rpc: RpcFallbackState | null;
  integrityStatus: IntegrityStatus;
  /** Human-readable explanation for degraded/blocked/error status. */
  statusReason: string | null;
}

// ── Staleness thresholds ─────────────────────────────────────────────────────

export interface StalenessThresholds {
  /** Data is considered stale after this many ms. */
  staleAfterMs: number;
  /** Write operations are blocked after this many ms of staleness. */
  criticalAfterMs: number;
}

export const DEFAULT_STALENESS: StalenessThresholds = {
  staleAfterMs: 30_000,       // 30 s
  criticalAfterMs: 5 * 60_000, // 5 min
};

// ── Circuit-breaker config ───────────────────────────────────────────────────

export interface CircuitBreakerConfig {
  /** Open circuit after this many consecutive failures. */
  failureThreshold: number;
  /** Close circuit after this many ms (half-open probe). */
  resetAfterMs: number;
  /** Timeout for a single RPC probe request (ms). */
  probeTimeoutMs: number;
}

export const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetAfterMs: 30_000,
  probeTimeoutMs: 5_000,
};
