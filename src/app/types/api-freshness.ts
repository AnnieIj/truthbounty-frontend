/**
 * API Freshness and Degraded-State Metadata Types
 * 
 * Provides indexed height, finalized height, last update, lag, and dependency degradation
 * without claiming on-chain failure.
 */

export type DependencyStatus = 'healthy' | 'degraded' | 'unavailable';

export interface DependencyHealth {
  name: string;
  status: DependencyStatus;
  lastSuccessfulUpdate?: string;
  error?: string;
  latencyMs?: number;
}

/**
 * API Freshness metadata from indexer
 * Indexed height: latest block indexed by the API
 * Finalized height: latest block with confirmed finality
 * Last update: timestamp of last successful indexer sync
 * Lag: difference between chain head and indexed height
 */
export interface ApiFreshness {
  indexedHeight: number;
  finalizedHeight: number;
  lastUpdate: string; // ISO 8601 timestamp
  lag: number; // chain head - indexed height
  chainHeadHeight: number;
  dependencies: DependencyHealth[];
}

/**
 * Degraded-state metadata
 * Indicates API/indexer health without claiming on-chain failure
 */
export interface DegradedStateMetadata {
  isDegraded: boolean;
  degradationReason?: 'indexer_lag' | 'dependency_failure' | 'stale_data' | 'partial_outage';
  affectedDependencies: string[];
  lastHealthyUpdate?: string;
  estimatedRecovery?: string;
}

/**
 * Combined API health response
 */
export interface ApiHealthResponse {
  freshness: ApiFreshness;
  degradedState: DegradedStateMetadata;
  fetchedAt: string;
}

/**
 * Configuration for freshness polling
 */
export interface UseApiFreshnessConfig {
  /** Polling interval in milliseconds (default: 30000) */
  pollInterval?: number;
  /** Maximum acceptable lag before marking as degraded (default: 100 blocks) */
  maxAcceptableLag?: number;
  /** Chain ID to validate against (default: Optimism Sepolia 11155420) */
  expectedChainId?: number;
}

/**
 * Result from useApiFreshness hook
 */
export interface UseApiFreshnessResult {
  /** Combined API health data */
  data: ApiHealthResponse | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Manual refetch function */
  refetch: () => Promise<void>;
  /** Whether data is considered fresh (within poll interval) */
  isFresh: boolean;
  /** Degradation status for quick checks */
  isDegraded: boolean;
}

/**
 * Freshness thresholds for UI indicators
 */
export const FRESHNESS_THRESHOLDS = {
  FRESH_LAG: 10,      // blocks - considered real-time
  STALE_LAG: 50,      // blocks - warning threshold
  DEGRADED_LAG: 100,  // blocks - degraded threshold
  CRITICAL_LAG: 500,  // blocks - critical threshold
} as const;

/**
 * Dependency names used in the system
 */
export const KNOWN_DEPENDENCIES = [
  'indexer',
  'rpc_provider',
  'contract_registry',
  'websocket',
  'subgraph',
] as const;

export type KnownDependency = typeof KNOWN_DEPENDENCIES[number];

/**
 * Helper to determine freshness status from lag
 */
export function getFreshnessStatus(lag: number): 'fresh' | 'stale' | 'degraded' | 'critical' {
  if (lag <= FRESHNESS_THRESHOLDS.FRESH_LAG) return 'fresh';
  if (lag <= FRESHNESS_THRESHOLDS.STALE_LAG) return 'stale';
  if (lag <= FRESHNESS_THRESHOLDS.DEGRADED_LAG) return 'degraded';
  return 'critical';
}

/**
 * Helper to format lag for display
 */
export function formatLag(lag: number): string {
  if (lag < 0) return 'synced';
  if (lag === 0) return '0 blocks';
  return `${lag} blocks`;
}

/**
 * Helper to format timestamp for display
 */
export function formatLastUpdate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}