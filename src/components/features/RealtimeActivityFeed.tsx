// src/components/features/RealtimeActivityFeed.tsx

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocketContext } from '@/components/providers/WebSocketProvider';
import { useReducedMotion } from '@/components/hooks/useReducedMotion';
import type {
  ClaimCreatedEvent,
  ClaimStatusChangedEvent,
  VerificationAddedEvent,
  DisputeCreatedEvent,
  DisputeResolvedEvent,
} from '@/app/types/websocket';

interface ActivityItem {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

export function RealtimeActivityFeed() {
  const { subscribe, isConnected } = useWebSocketContext();
  const reducedMotion = useReducedMotion();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

  const addActivity = useCallback((activity: ActivityItem) => {
    setActivities((prev) => [activity, ...prev].slice(0, 50)); // Keep last 50
  }, []);

  useEffect(() => {
    if (!isConnected) return;

    // Subscribe to various events and create activity items
    const unsubscribers = [
      subscribe('CLAIM_CREATED', (payload: ClaimCreatedEvent) => {
        const activity: ActivityItem = {
          id: `claim-${payload.claim.id}-${Date.now()}`,
          type: 'claim_created',
          message: `New claim: "${payload.claim.title}"`,
          timestamp: new Date().toISOString(),
        };
        addActivity(activity);
      }),
      subscribe('CLAIM_STATUS_CHANGED', (payload: ClaimStatusChangedEvent) => {
        const activity: ActivityItem = {
          id: `status-${payload.claimId}-${Date.now()}`,
          type: 'status_changed',
          message: `Claim status changed to ${payload.newStatus}`,
          timestamp: new Date().toISOString(),
        };
        addActivity(activity);
      }),
      subscribe('VERIFICATION_ADDED', (payload: VerificationAddedEvent) => {
        const activity: ActivityItem = {
          id: `verify-${payload.verification.id}-${Date.now()}`,
          type: 'verification',
          message: `New verification on claim`,
          timestamp: new Date().toISOString(),
        };
        addActivity(activity);
      }),
      subscribe('DISPUTE_CREATED', (payload: DisputeCreatedEvent) => {
        const activity: ActivityItem = {
          id: `dispute-${payload.dispute.id}-${Date.now()}`,
          type: 'dispute',
          message: `New dispute raised`,
          timestamp: new Date().toISOString(),
        };
        addActivity(activity);
      }),
      subscribe('DISPUTE_RESOLVED', (payload: DisputeResolvedEvent) => {
        const activity: ActivityItem = {
          id: `resolved-${payload.disputeId}-${Date.now()}`,
          type: 'dispute_resolved',
          message: `Dispute ${payload.outcome === 'UPHELD' ? 'upheld' : 'overturned'}`,
          timestamp: new Date().toISOString(),
        };
        addActivity(activity);
      }),
      subscribe('LEADERBOARD_UPDATED', () => {
        const activity: ActivityItem = {
          id: `leaderboard-${Date.now()}`,
          type: 'leaderboard',
          message: 'Leaderboard rankings updated',
          timestamp: new Date().toISOString(),
        };
        addActivity(activity);
      }),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [isConnected, subscribe, addActivity]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'claim_created':
        return 'bg-blue-500';
      case 'status_changed':
        return 'bg-amber-500';
      case 'verification':
        return 'bg-green-500';
      case 'dispute':
        return 'bg-red-500';
      case 'dispute_resolved':
        return 'bg-purple-500';
      case 'leaderboard':
        return 'bg-indigo-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'claim_created':
        return 'Claim';
      case 'status_changed':
        return 'Status';
      case 'verification':
        return 'Verify';
      case 'dispute':
        return 'Dispute';
      case 'dispute_resolved':
        return 'Resolved';
      case 'leaderboard':
        return 'Rank';
      default:
        return 'Event';
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200 dark:border-gray-800">
        <h3 className="font-semibold text-sm">Live Activity</h3>
        <span
          className={`flex items-center gap-1.5 text-xs ${
            isConnected
              ? 'text-green-600 dark:text-green-400'
              : 'text-gray-400 dark:text-gray-500'
          }`}
        >
          <span
            className={`size-2 rounded-full ${
              isConnected
                ? reducedMotion
                  ? 'bg-green-500'
                  : 'bg-green-500 animate-pulse'
                : 'bg-gray-400'
            }`}
            aria-hidden="true"
          />
          {isConnected ? 'Live' : 'Disconnected'}
        </span>
      </div>

      <div
        ref={feedRef}
        className="space-y-2 max-h-64 overflow-y-auto"
        aria-live="polite"
        aria-label="Live activity feed"
      >
        {!isConnected ? (
          <p className="text-xs text-gray-500 text-center py-4">
            Connect to see live updates
          </p>
        ) : activities.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">
            Waiting for activity...
          </p>
        ) : (
          activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-2 p-2 rounded bg-gray-50 dark:bg-gray-900/50 text-xs"
            >
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] text-white font-medium ${getTypeColor(
                  activity.type
                )}`}
              >
                {getTypeLabel(activity.type)}
              </span>
              <span className="flex-1 text-gray-700 dark:text-gray-300">
                {activity.message}
              </span>
              <span className="text-gray-400 text-[10px] whitespace-nowrap">
                {formatTime(activity.timestamp)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
