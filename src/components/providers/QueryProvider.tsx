// src/components/providers/QueryProvider.tsx

'use client';

import React, { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/app/queries/queryClient';
import { WebSocketProvider } from './WebSocketProvider';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { WalletScopedCacheSync } from '@/hooks/useWalletScopedCache';
import { ReorgReconciliationSync } from './ReorgReconciliationSync';
import { QueryDevtools } from './QueryDevtools';

interface QueryProviderProps {
  children: ReactNode;
}

/**
 * Component that handles real-time data sync when WebSocket is connected
 */
function RealtimeDataSync() {
  useRealtimeData();
  return null;
}

export function QueryProvider({ children }: QueryProviderProps) {
  // WebSocket URL - can be configured via environment variable
  const wsUrl = typeof window !== 'undefined' 
    ?  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws"
    : 'ws://localhost:8080/ws';

  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider
        config={{
          url: wsUrl,
          reconnectAttempts: 5,
          reconnectInterval: 3000,
          heartbeatInterval: 30000,
        }}
      >
        <RealtimeDataSync />
        {/* V2-FE-063: drop wallet-scoped cache on account/chain change */}
        <WalletScopedCacheSync />
        <ReorgReconciliationSync />
        {children}
      </WebSocketProvider>
      {/* DevTools are gated by process.env.NODE_ENV — never rendered in production. */}
      <QueryDevtools />
    </QueryClientProvider>
  );
}
