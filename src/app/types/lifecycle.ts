/**
 * V2 Claim Lifecycle Timeline Types - Canonical EVM/Optimism
 *
 * Event-derived lifecycle timeline tracking for claims, showing the complete
 * history of state transitions from creation through finalization.
 *
 * Security:
 * - All events are sourced from canonical chain events or validated API projections
 * - Never fabricates transaction state, settlement, or protocol outcomes
 * - Explicit staleness detection prevents showing outdated success states
 * - Reconciliation against chain state is mandatory for critical transitions
 */

import type { Address } from 'viem';
import type { ClaimStatus } from './claim';
import type { TransactionState } from './transaction';
import type { SettlementState } from './settlement';

/**
 * Lifecycle event types that can occur in a claim's history
 */
export type LifecycleEventType =
  | 'CLAIM_CREATED'
  | 'CLAIM_INDEXED'
  | 'VERIFICATION_SUBMITTED'
  | 'VERIFICATION_CONFIRMED'
  | 'VERIFICATION_PERIOD_ENDED'
  | 'DISPUTE_CREATED'
  | 'DISPUTE_CONFIRMED'
  | 'APPEAL_SUBMITTED'
  | 'APPEAL_CONFIRMED'
  | 'SETTLEMENT_INITIATED'
  | 'SETTLEMENT_CONFIRMED'
  | 'APPEAL_SETTLEMENT_INITIATED'
  | 'APPEAL_SETTLEMENT_CONFIRMED'
  | 'FINALIZATION_INITIATED'
  | 'FINALIZATION_CONFIRMED'
  | 'REWARDS_CLAIMED'
  | 'EVIDENCE_ADDED'
  | 'STATUS_CHANGED'
  | 'REORG_DETECTED'
  | 'RECONCILIATION_FAILED';

/**
 * Source of a lifecycle event for provenance tracking
 */
export type EventSource =
  | 'CHAIN_EVENT' // Direct blockchain event
  | 'CHAIN_QUERY' // On-chain state query result
  | 'API_PROJECTION' // Backend indexer projection
  | 'WEBSOCKET_UPDATE' // Real-time WebSocket event
  | 'LOCAL_SUBMISSION' // User-initiated transaction submission
  | 'RECONCILIATION'; // Reconciliation check result

/**
 * Lifecycle event finality level - indicates confidence in event permanence
 */
export type EventFinality =
  | 'SUBMITTED' // Transaction submitted but not confirmed
  | 'CONFIRMED' // 1+ confirmations
  | 'SAFE' // Safe from short-term reorgs (~2 confirmations on Optimism)
  | 'FINALIZED' // Canonical and immutable (L2 batch committed to L1)
  | 'INDEXED' // Fully indexed by backend projections
  | 'UNCONFIRMED' // API projection not yet confirmed on-chain
  | 'STALE' // Data may be outdated
  | 'FAILED'; // Transaction reverted or failed

/**
 * Base lifecycle event structure
 * All events must include provenance (source, timestamp, chain metadata)
 */
export interface LifecycleEvent {
  id: string; // Unique event identifier
  type: LifecycleEventType;
  source: EventSource;
  finality: EventFinality;
  timestamp: number; // Unix timestamp in milliseconds
  blockNumber?: bigint; // Block number for chain events
  transactionHash?: string; // Transaction hash if applicable
  actor?: Address; // Address that triggered the event
  metadata: Record<string, unknown>; // Event-specific metadata
  cursor?: string; // Sequence cursor for deduplication
}

/**
 * Claim creation event - initial lifecycle event
 */
export interface ClaimCreatedEvent extends LifecycleEvent {
  type: 'CLAIM_CREATED';
  metadata: {
    claimId: string;
    claimant: Address;
    contentDigest: string;
    bountyAmount: string; // Wei amount
    bountyToken: Address;
    artifactVersion: string;
  };
}

/**
 * Claim indexed event - backend has processed the claim
 */
export interface ClaimIndexedEvent extends LifecycleEvent {
  type: 'CLAIM_INDEXED';
  metadata: {
    claimId: string;
    indexedAt: number;
    indexerVersion: string;
  };
}

/**
 * Verification submitted event
 */
export interface VerificationSubmittedEvent extends LifecycleEvent {
  type: 'VERIFICATION_SUBMITTED';
  metadata: {
    claimId: string;
    verifier: Address;
    position: 'TRUE' | 'FALSE';
    stake: string; // Wei amount
  };
}

/**
 * Verification confirmed event
 */
export interface VerificationConfirmedEvent extends LifecycleEvent {
  type: 'VERIFICATION_CONFIRMED';
  metadata: {
    claimId: string;
    verificationId: string;
    verifier: Address;
    position: 'TRUE' | 'FALSE';
    stake: string;
    confirmations: number;
  };
}

/**
 * Verification period ended event
 */
export interface VerificationPeriodEndedEvent extends LifecycleEvent {
  type: 'VERIFICATION_PERIOD_ENDED';
  metadata: {
    claimId: string;
    endTime: number;
    totalStaked: string;
    trueStake: string;
    falseStake: string;
  };
}

/**
 * Dispute created event
 */
export interface DisputeCreatedEvent extends LifecycleEvent {
  type: 'DISPUTE_CREATED';
  metadata: {
    claimId: string;
    disputeId: string;
    disputer: Address;
    reason: string;
  };
}

/**
 * Dispute confirmed event
 */
export interface DisputeConfirmedEvent extends LifecycleEvent {
  type: 'DISPUTE_CONFIRMED';
  metadata: {
    claimId: string;
    disputeId: string;
    confirmations: number;
  };
}

/**
 * Appeal submitted event
 */
export interface AppealSubmittedEvent extends LifecycleEvent {
  type: 'APPEAL_SUBMITTED';
  metadata: {
    claimId: string;
    disputeId: string;
    appellant: Address;
  };
}

/**
 * Appeal confirmed event
 */
export interface AppealConfirmedEvent extends LifecycleEvent {
  type: 'APPEAL_CONFIRMED';
  metadata: {
    claimId: string;
    disputeId: string;
    confirmations: number;
  };
}

/**
 * Settlement initiated event
 */
export interface SettlementInitiatedEvent extends LifecycleEvent {
  type: 'SETTLEMENT_INITIATED';
  metadata: {
    claimId: string;
    settlementType: 'PROVISIONAL' | 'APPEAL';
    initiator: Address;
  };
}

/**
 * Settlement confirmed event
 */
export interface SettlementConfirmedEvent extends LifecycleEvent {
  type: 'SETTLEMENT_CONFIRMED';
  metadata: {
    claimId: string;
    settlementType: 'PROVISIONAL' | 'APPEAL';
    outcome: 'TRUE' | 'FALSE';
    confirmations: number;
  };
}

/**
 * Appeal settlement initiated event
 */
export interface AppealSettlementInitiatedEvent extends LifecycleEvent {
  type: 'APPEAL_SETTLEMENT_INITIATED';
  metadata: {
    claimId: string;
    disputeId: string;
    initiator: Address;
  };
}

/**
 * Appeal settlement confirmed event
 */
export interface AppealSettlementConfirmedEvent extends LifecycleEvent {
  type: 'APPEAL_SETTLEMENT_CONFIRMED';
  metadata: {
    claimId: string;
    disputeId: string;
    outcome: 'UPHELD' | 'OVERTURNED';
    confirmations: number;
  };
}

/**
 * Finalization initiated event
 */
export interface FinalizationInitiatedEvent extends LifecycleEvent {
  type: 'FINALIZATION_INITIATED';
  metadata: {
    claimId: string;
    initiator: Address;
  };
}

/**
 * Finalization confirmed event
 */
export interface FinalizationConfirmedEvent extends LifecycleEvent {
  type: 'FINALIZATION_CONFIRMED';
  metadata: {
    claimId: string;
    finalOutcome: 'TRUE' | 'FALSE';
    confirmations: number;
  };
}

/**
 * Rewards claimed event
 */
export interface RewardsClaimedEvent extends LifecycleEvent {
  type: 'REWARDS_CLAIMED';
  metadata: {
    claimId: string;
    claimant: Address;
    amount: string; // Wei amount
  };
}

/**
 * Evidence added event
 */
export interface EvidenceAddedEvent extends LifecycleEvent {
  type: 'EVIDENCE_ADDED';
  metadata: {
    claimId: string;
    evidenceId: string;
    contributor: Address;
    evidenceType: 'link' | 'text' | 'image' | 'video' | 'document';
  };
}

/**
 * Status changed event
 */
export interface StatusChangedEvent extends LifecycleEvent {
  type: 'STATUS_CHANGED';
  metadata: {
    claimId: string;
    previousStatus: ClaimStatus;
    newStatus: ClaimStatus;
    reason?: string;
  };
}

/**
 * Reorg detected event - chain reorganization affecting this claim
 */
export interface ReorgDetectedEvent extends LifecycleEvent {
  type: 'REORG_DETECTED';
  metadata: {
    claimId: string;
    affectedBlock: bigint;
    lastValidBlock: bigint;
    affectedEvents: string[]; // Event IDs that are now invalid
  };
}

/**
 * Reconciliation failed event - mismatch between chain and API state
 */
export interface ReconciliationFailedEvent extends LifecycleEvent {
  type: 'RECONCILIATION_FAILED';
  metadata: {
    claimId: string;
    expectedState: string;
    actualState: string;
    reason: string;
  };
}

/**
 * Union of all lifecycle event types
 */
export type AnyLifecycleEvent =
  | ClaimCreatedEvent
  | ClaimIndexedEvent
  | VerificationSubmittedEvent
  | VerificationConfirmedEvent
  | VerificationPeriodEndedEvent
  | DisputeCreatedEvent
  | DisputeConfirmedEvent
  | AppealSubmittedEvent
  | AppealConfirmedEvent
  | SettlementInitiatedEvent
  | SettlementConfirmedEvent
  | AppealSettlementInitiatedEvent
  | AppealSettlementConfirmedEvent
  | FinalizationInitiatedEvent
  | FinalizationConfirmedEvent
  | RewardsClaimedEvent
  | EvidenceAddedEvent
  | StatusChangedEvent
  | ReorgDetectedEvent
  | ReconciliationFailedEvent;

/**
 * Timeline state - current phase in the claim lifecycle
 */
export type TimelinePhase =
  | 'CREATED' // Claim created on-chain
  | 'INDEXING' // Being indexed by backend
  | 'VERIFICATION_OPEN' // Verification period active
  | 'VERIFICATION_CLOSED' // Verification period ended
  | 'DISPUTED' // Dispute raised
  | 'APPEAL_OPEN' // Appeal period active
  | 'PENDING_SETTLEMENT' // Awaiting settlement transaction
  | 'SETTLED' // Provisionally settled
  | 'PENDING_APPEAL_SETTLEMENT' // Awaiting appeal settlement
  | 'APPEAL_SETTLED' // Appeal settled
  | 'PENDING_FINALIZATION' // Awaiting finalization
  | 'FINALIZED' // Fully finalized
  | 'STALE' // Timeline data is stale
  | 'ERROR'; // Error state

/**
 * Timeline entry for display - enriched event with UI metadata
 */
export interface TimelineEntry {
  event: AnyLifecycleEvent;
  title: string; // Human-readable title
  description: string; // Detailed description
  icon?: string; // Icon identifier for UI
  severity: 'info' | 'success' | 'warning' | 'error';
  isUserAction: boolean; // Whether this was initiated by current user
  isPending: boolean; // Whether this event is unconfirmed
  isStale: boolean; // Whether this event data might be outdated
  canReconcile: boolean; // Whether reconciliation is possible
}

/**
 * Complete timeline state for a claim
 */
export interface ClaimLifecycleTimeline {
  claimId: string;
  currentPhase: TimelinePhase;
  events: AnyLifecycleEvent[];
  entries: TimelineEntry[]; // Enriched events for display
  lastUpdated: number; // Last update timestamp
  lastReconciled?: number; // Last reconciliation timestamp
  staleness: {
    isStale: boolean;
    reason?: string;
    lastValidTimestamp?: number;
    affectedEventIds?: string[];
  };
  finality: {
    earliestUnfinalizedEventId?: string;
    allEventsFinalized: boolean;
    pendingConfirmations: number;
  };
  reconciliation: {
    isReconciling: boolean;
    lastAttempt?: number;
    failureCount: number;
    lastError?: string;
  };
}

/**
 * Timeline query options
 */
export interface TimelineQueryOptions {
  claimId: string;
  includeStale?: boolean; // Include stale events
  maxStalenessMs?: number; // Max age before considering stale
  enableReconciliation?: boolean; // Auto-reconcile on staleness
  pollInterval?: number; // Polling interval for updates
}

/**
 * Timeline filter options
 */
export interface TimelineFilterOptions {
  eventTypes?: LifecycleEventType[];
  sources?: EventSource[];
  finality?: EventFinality[];
  minTimestamp?: number;
  maxTimestamp?: number;
  actors?: Address[];
}

/**
 * Timeline aggregation result
 */
export interface TimelineAggregation {
  totalEvents: number;
  eventsByType: Record<LifecycleEventType, number>;
  eventsBySource: Record<EventSource, number>;
  eventsByFinality: Record<EventFinality, number>;
  firstEvent?: AnyLifecycleEvent;
  lastEvent?: AnyLifecycleEvent;
  uniqueActors: Address[];
  totalDurationMs: number;
  pendingCount: number;
  finalizedCount: number;
}

/**
 * Reconciliation request
 */
export interface ReconciliationRequest {
  claimId: string;
  eventIdsToReconcile?: string[]; // Specific events, or all if omitted
  forceRefresh?: boolean; // Force chain query even if recently checked
}

/**
 * Reconciliation result
 */
export interface ReconciliationResult {
  claimId: string;
  reconciledAt: number;
  success: boolean;
  changes: Array<{
    eventId: string;
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  invalidatedEventIds: string[]; // Events no longer valid
  addedEvents: AnyLifecycleEvent[]; // New events discovered
  errors: Array<{
    eventId?: string;
    code: string;
    message: string;
  }>;
}

/**
 * Staleness configuration
 */
export interface StalenessConfig {
  maxAgeMs: number; // Max age before considering stale
  criticalEventTypes: LifecycleEventType[]; // Events that require strict freshness
  criticalMaxAgeMs: number; // Max age for critical events
  enableAutoReconciliation: boolean; // Auto-reconcile stale data
  reconciliationIntervalMs: number; // How often to reconcile
  maxReconciliationRetries: number; // Max retry attempts
}

/**
 * Timeline error codes
 */
export type TimelineErrorCode =
  | 'CLAIM_NOT_FOUND'
  | 'CHAIN_QUERY_FAILED'
  | 'API_PROJECTION_UNAVAILABLE'
  | 'RECONCILIATION_MISMATCH'
  | 'STALE_DATA_DETECTED'
  | 'REORG_DETECTED'
  | 'INVALID_EVENT_SOURCE'
  | 'UNSUPPORTED_CHAIN'
  | 'ARTIFACT_VERSION_MISMATCH';

/**
 * Timeline error
 */
export interface TimelineError {
  code: TimelineErrorCode;
  message: string;
  claimId?: string;
  eventId?: string;
  recoverable: boolean;
  retryAfterMs?: number;
  metadata?: Record<string, unknown>;
}
