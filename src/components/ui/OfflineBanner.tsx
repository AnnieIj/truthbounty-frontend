'use client';

import React from 'react';
import { WifiOff, Gauge } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { NETWORK_COPY } from '@/lib/network-copy';

/**
 * Global offline / low-bandwidth notice for read resilience.
 * Uses a polite live region so assistive tech announces connectivity changes
 * without interrupting the user (WCAG 2.2 AA).
 */
export default function OfflineBanner() {
  const { isOnline, isLowBandwidth, saveData, effectiveType } = useNetworkStatus();

  if (isOnline && !isLowBandwidth) return null;

  const offlineMessage = !isOnline ? NETWORK_COPY.offlineBanner : null;

  const lowBandwidthMessage =
    isLowBandwidth && isOnline
      ? saveData
        ? NETWORK_COPY.dataSaverBanner
        : `${NETWORK_COPY.slowConnectionBanner}${effectiveType ? ` (${effectiveType})` : ''}`
      : null;

  const message = offlineMessage ?? lowBandwidthMessage;
  if (!message) return null;

  const isOffline = !isOnline;

  return (
    <div
      className={`px-4 sm:px-8 py-3 text-sm font-medium flex items-start gap-2 ${
        isOffline ? 'bg-slate-800 text-white' : 'bg-amber-500 text-black'
      }`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="offline-banner"
    >
      {isOffline ? (
        <WifiOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      ) : (
        <Gauge className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      )}
      <span>{message}</span>
    </div>
  );
}
