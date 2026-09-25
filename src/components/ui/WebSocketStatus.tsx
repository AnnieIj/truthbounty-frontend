// src/components/ui/WebSocketStatus.tsx

'use client';

import { useWebSocketStatus } from '@/components/providers/WebSocketProvider';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useReducedMotion } from '@/components/hooks/useReducedMotion';

interface WebSocketStatusProps {
  showLabel?: boolean;
  className?: string;
}

export function WebSocketStatus({ showLabel = true, className = '' }: WebSocketStatusProps) {
  const { isConnected, connectionState, reconnectAttempts } = useWebSocketStatus();

  const statusText = connectionState === 'connecting' || connectionState === 'reconnecting'
    ? 'Connecting...'
    : isConnected
      ? 'Live'
      : 'Offline';

  if (connectionState === 'connecting') {
    return (
      <div className={`flex items-center gap-2 text-amber-500 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        {showLabel && <span className="text-sm">Connecting...</span>}
      </div>
    );
  }

  if (connectionState === 'reconnecting') {
    return (
      <div className={`flex items-center gap-2 text-amber-500 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        {showLabel && <span className="text-sm">Reconnecting... (Attempt {reconnectAttempts})</span>}
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className={`flex items-center gap-2 text-green-500 ${className}`}>
        <Wifi className="w-4 h-4" />
        {showLabel && <span className="text-sm">Live</span>}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 text-gray-400 ${className}`}
      aria-live="polite"
      aria-atomic="true"
      aria-label={`WebSocket status: ${statusText}`}
    >
      <WifiOff className="w-4 h-4" aria-hidden="true" />
      {showLabel && <span className="text-sm">{statusText}</span>}
    </div>
  );
}

/**
 * Compact indicator for use in headers/toolbars
 */
export function WebSocketIndicator({ className = '' }: { className?: string }) {
  const { connectionState } = useWebSocketStatus();
  const reducedMotion = useReducedMotion();

  const getColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
      case 'reconnecting':
        // Pulse animation is suppressed when the user prefers reduced motion.
        return reducedMotion ? 'bg-amber-500' : 'bg-amber-500 animate-pulse';
      case 'disconnected':
      case 'error':
      default:
        return 'bg-gray-400';
    }
  };

  const getTitle = () => {
    switch (connectionState) {
      case 'connected':
        return 'Real-time updates active';
      case 'connecting':
        return 'Connecting to real-time service...';
      case 'reconnecting':
        return 'Reconnecting to real-time service...';
      case 'disconnected':
      case 'error':
      default:
        return 'Real-time updates offline';
    }
  };

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${getColor()} ${className}`}
      title={getTitle()}
      aria-hidden="true"
    />
  );
}