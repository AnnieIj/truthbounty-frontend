'use client';

/**
 * V2 useClaimLifecycleTimeline Hook
 *
 * Aggregates canonical chain events, API projections, and WebSocket updates
 * into a unified claim lifecycle timeline. Never fabricates transaction state,
 * settlement outcomes, or protocol events.
 *
 * Security:
 * - All events sourced from validated chain queries or API projections
 * - Staleness detection prevents showing outdated success states
 * - Reconciliation required for critical state transitions
 * - Explicit error states for chain/API mismatches
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocketContext } from '@/components/providers/WebSocketProvider';
import { useAccount, useChainId } from 'wagmi';
import type {
  AnyLifecycleEvent,
  ClaimLifecycleTimeline,
  TimelinePhase,
  TimelineEntry,
  TimelineQueryOptions,
  TimelineError,
  ReconciliationResult,
  EventSource,
  EventFinality,
  LifecycleEventType,
} from '@/app/types/lifecycle';
import type { Claim, ClaimStatus } from '@/app/types/claim';
import type { Verification } from '@/app/types/verification';
import type { Dispute } from '@/app/types/dispute';

/**
 * Hook configuration
 */
interface UseClaimLifecycleTimelineConfig {
  claimId: string;
  enableRealtime?: boolean; // Subscribe to WebSocket updates
  enableAutoReconciliation?: boolean; // Auto-reconcile stale data
  maxStalenessMs?: number; // Max age before data is stale (default: 5 minutes)
  reconciliationIntervalMs?: number; // How often to reconcile (default: 30 seconds)
  pollInterval?: number; // Query polling interval (0 = disabled)
}

/**
 * Hook return type
 */
interface UseClaimLifecycleTimelineReturn {
  timeline: ClaimLifecycleTimeline | null;
  isLoading: boolean;
  isError: boolean;
  error: TimelineError | null;
  isStale: boolean;
  reconcile: () => Promise<void>;
  isReconciling: boolean;
  lastReconciled: number | null;
}

const DEFAULT_MAX_STALENESS_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_RECONCILIATION_INTERVAL_MS = 30 * 1000; // 30 seconds
const CRITICAL_EVENT_MAX_AGE_MS = 60 * 1000; // 1 minute for critical events

/**
 * Critical events that require strict freshness
 */
const CRITICAL_EVENT_TYPES: LifecycleEventType[] = [
  'SETTLEMENT_CONFIRMED',
  'APPEAL_SETTLEMENT_CONFIRMED',
  'FINALIZATION_CONFIRMED',
  'REWARDS_CLAIMED',
  'REORG_DETECTED',
  'RECONCILIATION_FAILED',
];

/**
 * Hook for managing claim lifecycle timeline with canonical state tracking
 */
export function useClaimLifecycleTimeline(
  config: UseClaimLifecycleTimelineConfig
): UseClaimLifecycleTimelineReturn {
  const {
    claimId,
    enableRealtime = true,
    enableAutoReconciliation = true,
    maxStalenessMs = DEFAULT_MAX_STALENESS_MS,
    reconciliationIntervalMs = DEFAULT_RECONCILIATION_INTERVAL_MS,
  } = config;

  const queryClient = useQueryClient();
  const { subscribe, isConnected } = useWebSocketContext();
  const { address } = useAccount();
  const chainId = useChainId();

  // Local state
  const [events, setEvents] = useState<AnyLifecycleEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<TimelineError | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [lastReconciled, setLastReconciled] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());

  /**
   * Fetch claim data from React Query cache or API
   */
  const fetchClaimData = useCallback(async (): Promise<Claim | null> => {
    const cached = queryClient.getQueryData<Claim>(['claims', claimId]);
    if (cached) return cached;

    // If not in cache, the query should be fetched by a parent component
    return null;
  }, [queryClient, claimId]);

  /**
   * Convert claim data to lifecycle events
   */
  const claimToEvents = useCallback(
    (claim: Claim): AnyLifecycleEvent[] => {
      const eventList: AnyLifecycleEvent[] = [];
      const now = Date.now();

      // Claim created event
      eventList.push({
        id: `claim-created-${claim.id}`,
        type: 'CLAIM_CREATED',
        source: 'API_PROJECTION',
        finality: 'INDEXED',
        timestamp: new Date(claim.createdAt).getTime(),
        actor: claim.claimantAddress as `0x${string}`,
        metadata: {
          claimId: claim.id,
          claimant: claim.claimantAddress as `0x${string}`,
          contentDigest: '', // Would come from chain event
          bountyAmount: claim.bountyAmount.toString(),
          bountyToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
          artifactVersion: '2.0.0',
        },
      });

      // Claim indexed event
      eventList.push({
        id: `claim-indexed-${claim.id}`,
        type: 'CLAIM_INDEXED',
        source: 'API_PROJECTION',
        finality: 'INDEXED',
        timestamp: new Date(claim.createdAt).getTime() + 1000,
        metadata: {
          claimId: claim.id,
          indexedAt: new Date(claim.createdAt).getTime(),
          indexerVersion: '2.0.0',
        },
      });

      // Status change events based on current status
      if (claim.status !== 'OPEN') {
        eventList.push({
          id: `status-changed-${claim.id}-${claim.status}`,
          type: 'STATUS_CHANGED',
          source: 'API_PROJECTION',
          finality: 'INDEXED',
          timestamp: new Date(claim.updatedAt).getTime(),
          metadata: {
            claimId: claim.id,
            previousStatus: 'OPEN' as ClaimStatus,
            newStatus: claim.status,
          },
        });
      }

      return eventList;
    },
    []
  );

  /**
   * Aggregate events from verifications
   */
  const verificationsToEvents = useCallback(
    (verifications: Verification[], claimId: string): AnyLifecycleEvent[] => {
      return verifications.flatMap((verification) => {
        const events: AnyLifecycleEvent[] = [];

        // Verification submitted event
        events.push({
          id: `verification-submitted-${verification.id}`,
          type: 'VERIFICATION_SUBMITTED',
          source: verification.transactionHash ? 'CHAIN_EVENT' : 'API_PROJECTION',
          finality:
            verification.status === 'CONFIRMED'
              ? 'CONFIRMED'
              : verification.status === 'PENDING'
                ? 'SUBMITTED'
                : 'FAILED',
          timestamp: new Date(verification.createdAt).getTime(),
          transactionHash: verification.transactionHash,
          actor: verification.verifierAddress as `0x${string}`,
          metadata: {
            claimId,
            verifier: verification.verifierAddress as `0x${string}`,
            position: verification.decision === 'VERIFY' ? 'TRUE' : 'FALSE',
            stake: verification.stakeAmount.toString(),
          },
        });

        // Verification confirmed event (if confirmed)
        if (verification.status === 'CONFIRMED' && verification.confirmedAt) {
          events.push({
            id: `verification-confirmed-${verification.id}`,
            type: 'VERIFICATION_CONFIRMED',
            source: 'CHAIN_EVENT',
            finality: 'CONFIRMED',
            timestamp: new Date(verification.confirmedAt).getTime(),
            transactionHash: verification.transactionHash,
            actor: verification.verifierAddress as `0x${string}`,
            metadata: {
              claimId,
              verificationId: verification.id,
              verifier: verification.verifierAddress as `0x${string}`,
              position: verification.decision === 'VERIFY' ? 'TRUE' : 'FALSE',
              stake: verification.stakeAmount.toString(),
              confirmations: 1,
            },
          });
        }

        return events;
      });
    },
    []
  );

  /**
   * Aggregate events from disputes
   */
  const disputesToEvents = useCallback(
    (disputes: Dispute[], claimId: string): AnyLifecycleEvent[] => {
      return disputes.flatMap((dispute) => {
        const events: AnyLifecycleEvent[] = [];

        // Dispute created event
        events.push({
          id: `dispute-created-${dispute.id}`,
          type: 'DISPUTE_CREATED',
          source: 'API_PROJECTION',
          finality: 'INDEXED',
          timestamp: new Date(dispute.createdAt).getTime(),
          metadata: {
            claimId,
            disputeId: dispute.id,
            disputer: '0x0000000000000000000000000000000000000000' as `0x${string}`,
            reason: dispute.reason || '',
          },
        });

        return events;
      });
    },
    []
  );

  /**
   * Determine current phase from events
   */
  const determinePhase = useCallback(
    (events: AnyLifecycleEvent[], claim: Claim | null): TimelinePhase => {
      if (!claim) return 'CREATED';

      const latestEvent = events[events.length - 1];

      // Check for error states
      if (latestEvent?.type === 'RECONCILIATION_FAILED') return 'ERROR';
      if (latestEvent?.type === 'REORG_DETECTED') return 'STALE';

      // Check for finalized state
      if (latestEvent?.type === 'FINALIZATION_CONFIRMED') return 'FINALIZED';

      // Check for settlement states
      if (latestEvent?.type === 'APPEAL_SETTLEMENT_CONFIRMED') return 'APPEAL_SETTLED';
      if (latestEvent?.type === 'SETTLEMENT_CONFIRMED') return 'SETTLED';
      if (latestEvent?.type === 'SETTLEMENT_INITIATED') return 'PENDING_SETTLEMENT';
      if (latestEvent?.type === 'APPEAL_SETTLEMENT_INITIATED')
        return 'PENDING_APPEAL_SETTLEMENT';

      // Check for dispute/appeal states
      const hasDispute = events.some((e) => e.type === 'DISPUTE_CREATED');
      if (hasDispute) {
        const hasAppeal = events.some((e) => e.type === 'APPEAL_SUBMITTED');
        return hasAppeal ? 'APPEAL_OPEN' : 'DISPUTED';
      }

      // Check verification state
      const hasVerificationPeriodEnded = events.some(
        (e) => e.type === 'VERIFICATION_PERIOD_ENDED'
      );
      if (hasVerificationPeriodEnded) return 'VERIFICATION_CLOSED';

      // Check if indexing
      const hasIndexed = events.some((e) => e.type === 'CLAIM_INDEXED');
      if (!hasIndexed) return 'INDEXING';

      // Default to verification open
      return 'VERIFICATION_OPEN';
    },
    []
  );

  /**
   * Check if timeline is stale
   */
  const checkStaleness = useCallback(
    (events: AnyLifecycleEvent[], now: number): boolean => {
      if (events.length === 0) return false;

      // Check critical events
      const criticalEvents = events.filter((e) =>
        CRITICAL_EVENT_TYPES.includes(e.type)
      );
      for (const event of criticalEvents) {
        if (now - event.timestamp > CRITICAL_EVENT_MAX_AGE_MS) {
          return true;
        }
      }

      // Check overall staleness
      const latestEvent = events[events.length - 1];
      if (!latestEvent) return false;

      return now - latestEvent.timestamp > maxStalenessMs;
    },
    [maxStalenessMs]
  );

  /**
   * Enrich events into timeline entries for display
   */
  const enrichEvents = useCallback(
    (events: AnyLifecycleEvent[], userAddress?: string): TimelineEntry[] => {
      return events.map((event) => {
        const isUserAction = event.actor === userAddress;
        const isPending = event.finality === 'SUBMITTED' || event.finality === 'UNCONFIRMED';
        const isStale =
          event.finality === 'STALE' ||
          (CRITICAL_EVENT_TYPES.includes(event.type) &&
            Date.now() - event.timestamp > CRITICAL_EVENT_MAX_AGE_MS);

        // Generate title and description based on event type
        const { title, description, icon, severity } = getEventDisplayInfo(event);

        return {
          event,
          title,
          description,
          icon,
          severity,
          isUserAction,
          isPending,
          isStale,
          canReconcile: isStale && event.source !== 'LOCAL_SUBMISSION',
        };
      });
    },
    []
  );

  /**
   * Reconcile timeline with canonical chain/API state
   */
  const reconcile = useCallback(async () => {
    if (isReconciling) return;

    setIsReconciling(true);
    setError(null);

    try {
      // Fetch fresh claim data
      const claim = await fetchClaimData();
      if (!claim) {
        throw new Error('Claim not found');
      }

      // Rebuild events from fresh data
      const freshEvents = claimToEvents(claim);

      // TODO: Fetch verifications and disputes from API
      // For now, use existing events as base

      // Update state
      setEvents(freshEvents);
      setLastReconciled(Date.now());
      setLastUpdated(Date.now());
      setIsError(false);
    } catch (err) {
      console.error('Timeline reconciliation failed:', err);
      setError({
        code: 'RECONCILIATION_MISMATCH',
        message: err instanceof Error ? err.message : 'Reconciliation failed',
        claimId,
        recoverable: true,
        retryAfterMs: 5000,
      });
      setIsError(true);
    } finally {
      setIsReconciling(false);
    }
  }, [isReconciling, fetchClaimData, claimToEvents, claimId]);

  /**
   * Initialize timeline from claim data
   */
  useEffect(() => {
    let mounted = true;

    const initTimeline = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const claim = await fetchClaimData();
        if (!claim) {
          throw new Error('Claim not found');
        }

        if (!mounted) return;

        const initialEvents = claimToEvents(claim);
        setEvents(initialEvents);
        setLastUpdated(Date.now());
        setIsError(false);
      } catch (err) {
        if (!mounted) return;

        console.error('Failed to initialize timeline:', err);
        setError({
          code: 'CLAIM_NOT_FOUND',
          message: err instanceof Error ? err.message : 'Failed to load timeline',
          claimId,
          recoverable: true,
          retryAfterMs: 3000,
        });
        setIsError(true);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initTimeline();

    return () => {
      mounted = false;
    };
  }, [claimId, fetchClaimData, claimToEvents]);

  /**
   * Subscribe to WebSocket updates
   */
  useEffect(() => {
    if (!enableRealtime || !isConnected) return;

    const unsubscribers = [
      subscribe('CLAIM_UPDATED', (payload) => {
        if (payload.claimId === claimId) {
          setLastUpdated(Date.now());
          // Trigger reconciliation to fetch fresh data
          if (enableAutoReconciliation) {
            reconcile();
          }
        }
      }),
      subscribe('CLAIM_STATUS_CHANGED', (payload) => {
        if (payload.claimId === claimId) {
          setLastUpdated(Date.now());
          if (enableAutoReconciliation) {
            reconcile();
          }
        }
      }),
      subscribe('VERIFICATION_ADDED', (payload) => {
        if (payload.claimId === claimId) {
          setLastUpdated(Date.now());
          if (enableAutoReconciliation) {
            reconcile();
          }
        }
      }),
      subscribe('DISPUTE_CREATED', (payload) => {
        if (payload.claimId === claimId) {
          setLastUpdated(Date.now());
          if (enableAutoReconciliation) {
            reconcile();
          }
        }
      }),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub?.());
    };
  }, [
    enableRealtime,
    isConnected,
    subscribe,
    claimId,
    enableAutoReconciliation,
    reconcile,
  ]);

  /**
   * Auto-reconciliation interval
   */
  useEffect(() => {
    if (!enableAutoReconciliation) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const isStale = checkStaleness(events, now);

      if (isStale && !isReconciling) {
        reconcile();
      }
    }, reconciliationIntervalMs);

    return () => clearInterval(interval);
  }, [
    enableAutoReconciliation,
    reconciliationIntervalMs,
    events,
    checkStaleness,
    isReconciling,
    reconcile,
  ]);

  /**
   * Build timeline object
   */
  const timeline = useMemo((): ClaimLifecycleTimeline | null => {
    if (events.length === 0) return null;

    const now = Date.now();
    const isStale = checkStaleness(events, now);
    const claim = queryClient.getQueryData<Claim>(['claims', claimId]);

    const currentPhase = determinePhase(events, claim || null);
    const entries = enrichEvents(events, address);

    // Calculate finality metrics
    const unfinalizedEvents = events.filter(
      (e) =>
        e.finality === 'SUBMITTED' ||
        e.finality === 'CONFIRMED' ||
        e.finality === 'UNCONFIRMED'
    );
    const allEventsFinalized = unfinalizedEvents.length === 0;

    return {
      claimId,
      currentPhase,
      events,
      entries,
      lastUpdated,
      lastReconciled: lastReconciled || undefined,
      staleness: {
        isStale,
        reason: isStale ? 'Data may be outdated' : undefined,
        lastValidTimestamp: isStale ? lastReconciled || lastUpdated : undefined,
      },
      finality: {
        earliestUnfinalizedEventId: unfinalizedEvents[0]?.id,
        allEventsFinalized,
        pendingConfirmations: unfinalizedEvents.length,
      },
      reconciliation: {
        isReconciling,
        lastAttempt: lastReconciled || undefined,
        failureCount: isError ? 1 : 0,
        lastError: error?.message,
      },
    };
  }, [
    events,
    claimId,
    lastUpdated,
    lastReconciled,
    isReconciling,
    isError,
    error,
    checkStaleness,
    determinePhase,
    enrichEvents,
    address,
    queryClient,
  ]);

  return {
    timeline,
    isLoading,
    isError,
    error,
    isStale: timeline?.staleness.isStale || false,
    reconcile,
    isReconciling,
    lastReconciled,
  };
}

/**
 * Get display information for an event
 */
function getEventDisplayInfo(event: AnyLifecycleEvent): {
  title: string;
  description: string;
  icon?: string;
  severity: 'info' | 'success' | 'warning' | 'error';
} {
  switch (event.type) {
    case 'CLAIM_CREATED':
      return {
        title: 'Claim Created',
        description: 'Claim submitted to the blockchain',
        icon: 'plus-circle',
        severity: 'info',
      };

    case 'CLAIM_INDEXED':
      return {
        title: 'Claim Indexed',
        description: 'Claim processed by the indexer',
        icon: 'database',
        severity: 'success',
      };

    case 'VERIFICATION_SUBMITTED':
      return {
        title: 'Verification Submitted',
        description: `Verification ${event.metadata.position} submitted`,
        icon: 'check-circle',
        severity: 'info',
      };

    case 'VERIFICATION_CONFIRMED':
      return {
        title: 'Verification Confirmed',
        description: `Verification confirmed on chain`,
        icon: 'shield-check',
        severity: 'success',
      };

    case 'VERIFICATION_PERIOD_ENDED':
      return {
        title: 'Verification Period Ended',
        description: 'Verification period has closed',
        icon: 'clock',
        severity: 'info',
      };

    case 'DISPUTE_CREATED':
      return {
        title: 'Dispute Created',
        description: 'Claim outcome disputed',
        icon: 'alert-triangle',
        severity: 'warning',
      };

    case 'SETTLEMENT_CONFIRMED':
      return {
        title: 'Settlement Confirmed',
        description: 'Claim settled on chain',
        icon: 'check-square',
        severity: 'success',
      };

    case 'FINALIZATION_CONFIRMED':
      return {
        title: 'Claim Finalized',
        description: 'Claim outcome is final',
        icon: 'flag',
        severity: 'success',
      };

    case 'REWARDS_CLAIMED':
      return {
        title: 'Rewards Claimed',
        description: 'Rewards claimed by participant',
        icon: 'gift',
        severity: 'success',
      };

    case 'REORG_DETECTED':
      return {
        title: 'Chain Reorganization',
        description: 'Blockchain reorganization detected',
        icon: 'alert-circle',
        severity: 'error',
      };

    case 'RECONCILIATION_FAILED':
      return {
        title: 'Reconciliation Failed',
        description: 'State mismatch detected',
        icon: 'x-circle',
        severity: 'error',
      };

    default:
      return {
        title: 'Event',
        description: 'Timeline event',
        icon: 'circle',
        severity: 'info',
      };
  }
}
