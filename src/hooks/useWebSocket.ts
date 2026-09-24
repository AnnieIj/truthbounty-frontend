// src/hooks/useWebSocket.ts

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type {
  WebSocketConfig,
  WebSocketConnectionState,
  WebSocketEvent,
  WebSocketEventHandler,
  WebSocketEventType,
  RollbackEvent,
  ReplacementEvent,
} from '@/app/types/websocket';

const DEFAULT_RECONNECT_ATTEMPTS = 10;
const DEFAULT_INITIAL_RECONNECT_INTERVAL = 1000; // 1 second initial delay
const DEFAULT_MAX_RECONNECT_INTERVAL = 30000; // 30 seconds max delay
const DEFAULT_HEARTBEAT_INTERVAL = 30000;
const DEFAULT_BACKOFF_MULTIPLIER = 2; // Exponential backoff multiplier
const DEFAULT_MESSAGE_CACHE_SIZE = 1000; // Max number of messages to keep for deduplication
const DEFAULT_CURSOR_STORAGE_KEY = 'truthbounty:ws:cursor';
const DEFAULT_HTTP_CATCHUP_URL = '/api/claims/catchup';

type TimeoutId = ReturnType<typeof setTimeout>;
type IntervalId = ReturnType<typeof setInterval>;
type AnyEventHandler = (payload: never) => void;

/**
 * Enhanced WebSocket hook with:
 * - Resume cursor persistence
 * - Message deduplication
 * - Exponential backoff with jitter
 * - Heartbeat monitoring
 * - HTTP catch-up mechanism
 * - Rollback/replacement support for projection-aware caches
 */
export function useWebSocket(config?: WebSocketConfig) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const heartbeatIntervalRef = useRef<IntervalId | null>(null);
  const reconnectTimeoutRef = useRef<TimeoutId | null>(null);
  const listenersRef = useRef<
    Map<WebSocketEventType, Set<AnyEventHandler>>
  >(new Map());
  const isMountedRef = useRef(true);
  const connectRef = useRef<() => void>(() => {});
  const processedMessagesRef = useRef<Set<string>>(new Set());
  const lastCursorRef = useRef<string | null>(null);
  const authTokenRef = useRef<string | null>(null);

  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketEvent | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [lastCursor, setLastCursor] = useState<string | null>(null);

  const {
    url,
    authToken,
    reconnectAttempts = DEFAULT_RECONNECT_ATTEMPTS,
    reconnectInterval, // Deprecated
    initialReconnectInterval: initialInterval,
    maxReconnectInterval = DEFAULT_MAX_RECONNECT_INTERVAL,
    heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL,
    backoffMultiplier = DEFAULT_BACKOFF_MULTIPLIER,
    messageCacheSize = DEFAULT_MESSAGE_CACHE_SIZE,
    cursorStorageKey = DEFAULT_CURSOR_STORAGE_KEY,
    httpCatchupUrl = DEFAULT_HTTP_CATCHUP_URL,
    onConnect,
    onDisconnect,
    onError,
    onMessage,
    onRollback,
    onReplacement,
  } = config || {};

  // Update auth token if it changes
  useEffect(() => {
    authTokenRef.current = authToken || null;
  }, [authToken]);

  // Use deprecated reconnectInterval if provided for backward compatibility, otherwise use default
  const initialReconnectInterval = initialInterval ?? reconnectInterval ?? DEFAULT_INITIAL_RECONNECT_INTERVAL;

  // Load persisted cursor from localStorage on mount
  useEffect(() => {
    try {
      const persistedCursor = localStorage.getItem(cursorStorageKey);
      if (persistedCursor) {
        lastCursorRef.current = persistedCursor;
        setLastCursor(persistedCursor);
      }
    } catch (e) {
      console.warn('Failed to load persisted WebSocket cursor:', e);
    }
  }, [cursorStorageKey]);

  // Persist cursor to localStorage when it changes
  useEffect(() => {
    if (lastCursor) {
      try {
        localStorage.setItem(cursorStorageKey, lastCursor);
      } catch (e) {
        console.warn('Failed to persist WebSocket cursor:', e);
      }
    }
  }, [lastCursor, cursorStorageKey]);

  // Calculate exponential backoff delay
  const getBackoffDelay = useCallback((attempt: number) => {
    return Math.min(
      initialReconnectInterval * Math.pow(backoffMultiplier, attempt),
      maxReconnectInterval
    );
  }, [initialReconnectInterval, maxReconnectInterval, backoffMultiplier]);

  // Clear all timers and intervals
  const clearAllTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // Generate message ID for deduplication
  const generateMessageId = (event: WebSocketEvent): string => {
    return `${event.type}:${event.timestamp}:${JSON.stringify(event.payload).slice(0, 100)}`;
  };

  // HTTP catch-up mechanism to fetch missed messages when reconnecting
  const fetchCatchupMessages = useCallback(async (fromCursor: string | null) => {
    if (!fromCursor) return;
    
    try {
      const response = await fetch(`${httpCatchupUrl}?from=${encodeURIComponent(fromCursor)}`, {
        headers: authTokenRef.current ? { 'Authorization': `Bearer ${authTokenRef.current}` } : {},
      });
      
      if (response.ok) {
        const messages: WebSocketEvent[] = await response.json();
        // Process missed messages in order
        for (const message of messages) {
          const messageId = generateMessageId(message);
          if (!processedMessagesRef.current.has(messageId)) {
            processedMessagesRef.current.add(messageId);
            // Maintain cache size
            if (processedMessagesRef.current.size > messageCacheSize) {
              const iterator = processedMessagesRef.current.values();
              const oldest = iterator.next().value;
              if (oldest !== undefined) {
                processedMessagesRef.current.delete(oldest);
              }
            }
            
            // Update cursor
            if (message.cursor) {
              lastCursorRef.current = message.cursor;
              setLastCursor(message.cursor);
            }
            
            // Dispatch message
            const listeners = listenersRef.current.get(message.type);
            if (listeners) {
              listeners.forEach((handler) => {
                if (isMountedRef.current) {
                  handler(message.payload as never);
                }
              });
            }
            onMessage?.(message);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch catch-up messages:', err);
    }
  }, [httpCatchupUrl, messageCacheSize, onMessage]);

  // Dispatch an event payload to typed subscribers registered via `subscribe()`
  const dispatchToListeners = useCallback(
    (data: WebSocketEvent) => {
      const listeners = listenersRef.current.get(data.type);
      if (!listeners) return;
      listeners.forEach((handler) => {
        if (isMountedRef.current) {
          handler(data.payload as never);
        }
      });
    },
    [],
  );

  // Process incoming message with deduplication and cursor tracking
  const processMessage = useCallback((data: WebSocketEvent) => {
    const messageId = generateMessageId(data);
    
    // Skip if already processed
    if (processedMessagesRef.current.has(messageId)) {
      return;
    }

    // Add to processed messages
    processedMessagesRef.current.add(messageId);
    
    // Maintain cache size to prevent memory leaks
    if (processedMessagesRef.current.size > messageCacheSize) {
      const iterator = processedMessagesRef.current.values();
      const oldest = iterator.next().value;
      if (oldest !== undefined) {
        processedMessagesRef.current.delete(oldest);
      }
    }

    // Update cursor if present in message
    if ('cursor' in data && typeof data.cursor === 'string') {
      lastCursorRef.current = data.cursor;
      setLastCursor(data.cursor);
    }

    // Handle rollback events for chain reorgs
    // The event is delivered both to the config callback and to typed
    // subscribers (via `subscribe('ROLLBACK', …)`) so projection-aware
    // consumers can reconcile without bypassing the pub/sub registry.
    if (data.type === 'ROLLBACK') {
      onRollback?.(data.payload as RollbackEvent);
      dispatchToListeners(data);
      setLastMessage(data);
      onMessage?.(data);
      return;
    }

    // Handle replacement events for transaction replacements. Same dual
    // delivery contract as ROLLBACK (callback + typed subscribers).
    if (data.type === 'REPLACEMENT') {
      onReplacement?.(data.payload as ReplacementEvent);
      dispatchToListeners(data);
      setLastMessage(data);
      onMessage?.(data);
      return;
    }

    // Dispatch to registered listeners
    const listeners = listenersRef.current.get(data.type);
    if (listeners) {
      listeners.forEach((handler) => {
        if (isMountedRef.current) {
          handler(data.payload as never);
        }
      });
    }

    setLastMessage(data);
    onMessage?.(data);
  }, [messageCacheSize, onMessage, onRollback, onReplacement, dispatchToListeners]);

  // Connect to WebSocket server
  const connect = useCallback(() => {
    if (!url || !isMountedRef.current) return;

    // Clear any existing connections or timers before creating new one
    if (socketRef.current) {
      socketRef.current.close(1000, 'Creating new connection');
      socketRef.current = null;
    }
    clearAllTimers();

    setConnectionState('connecting');
    setError(null);

    try {
      // Append last cursor to connection URL to resume from last processed message
      const connectionUrl = lastCursorRef.current 
        ? `${url}?cursor=${encodeURIComponent(lastCursorRef.current)}`
        : url;
        
      const socket = new WebSocket(connectionUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!isMountedRef.current) return;
        
        setConnectionState('connected');
        reconnectAttemptsRef.current = 0;
        setReconnectCount(0);
        onConnect?.();

        // Authenticate if token is available
        if (authTokenRef.current) {
          socket.send(JSON.stringify({ 
            type: 'AUTHENTICATE', 
            token: authTokenRef.current 
          }));
        }

        // Start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN && isMountedRef.current) {
            socket.send(JSON.stringify({ type: 'PING', cursor: lastCursorRef.current }));
          }
        }, heartbeatInterval);

        // Trigger HTTP catch-up to fetch any messages missed during reconnection
        if (lastCursorRef.current) {
          fetchCatchupMessages(lastCursorRef.current);
        }
      };

      socket.onmessage = (event) => {
        if (!isMountedRef.current) return;
        
        try {
          const data: WebSocketEvent = JSON.parse(event.data);
          processMessage(data);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      socket.onclose = (event) => {
        if (!isMountedRef.current) return;
        
        setConnectionState('disconnected');
        onDisconnect?.();

        // Clear heartbeat
        clearAllTimers();

        // Attempt reconnection if not a clean close and still mounted
        if (!event.wasClean && reconnectAttemptsRef.current < reconnectAttempts && isMountedRef.current) {
          setConnectionState('reconnecting');
          const attempt = reconnectAttemptsRef.current;
          reconnectAttemptsRef.current += 1;
          setReconnectCount(reconnectAttemptsRef.current);
          
          const delay = getBackoffDelay(attempt);
          console.log(`WebSocket disconnected. Attempting reconnection ${reconnectAttemptsRef.current}/${reconnectAttempts} in ${Math.round(delay)}ms`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connectRef.current();
            }
          }, delay);
        } else if (reconnectAttemptsRef.current >= reconnectAttempts) {
          console.error('Max WebSocket reconnection attempts reached. Giving up.');
          setConnectionState('error');
        }
      };

      socket.onerror = (event) => {
        if (!isMountedRef.current) return;
        
        const errorEvent = new Error('WebSocket error');
        setError(errorEvent);
        onError?.({
          code: 'WS_ERROR',
          message: 'WebSocket connection error',
          details: event,
        });
      };
    } catch (err) {
      if (!isMountedRef.current) return;
      
      setConnectionState('error');
      setError(err as Error);
    }
  }, [url, reconnectAttempts, heartbeatInterval, getBackoffDelay, clearAllTimers, onConnect, onDisconnect, onError, processMessage, fetchCatchupMessages]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Disconnect from WebSocket server
  const disconnect = useCallback(() => {
    clearAllTimers();
    if (socketRef.current) {
      socketRef.current.close(1000, 'Client disconnect');
      socketRef.current = null;
    }
    setConnectionState('disconnected');
  }, [clearAllTimers]);

  // Subscribe to specific event type
  const subscribe = useCallback(<T extends WebSocketEventType>(
    eventType: T,
    handler: WebSocketEventHandler<T>
  ) => {
    const listeners = listenersRef.current;
    if (!listeners.has(eventType)) {
      listeners.set(eventType, new Set());
    }
    listeners.get(eventType)!.add(handler as unknown as AnyEventHandler);

    // Return unsubscribe function
    return () => {
      listeners.get(eventType)?.delete(handler as unknown as AnyEventHandler);
    };
  }, []);

  // Send message through WebSocket
  const send = useCallback((message: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected. Could not send message.');
    }
  }, []);

  // Auto-connect on mount if URL provided
  useEffect(() => {
    isMountedRef.current = true;
    
    if (url) {
      connect();
    }

    const currentListeners = listenersRef.current;
    return () => {
      // Mark as unmounted to prevent any state updates after cleanup
      isMountedRef.current = false;
      // Clean up all resources
      disconnect();
      // Clear all listeners to prevent memory leaks
      currentListeners.forEach((listeners) => listeners.clear());
      currentListeners.clear();
    };
  }, [url, connect, disconnect]);

  // Clear persisted cursor
  const clearPersistedCursor = useCallback(() => {
    try {
      localStorage.removeItem(cursorStorageKey);
      lastCursorRef.current = null;
      setLastCursor(null);
    } catch (e) {
      console.warn('Failed to clear persisted WebSocket cursor:', e);
    }
  }, [cursorStorageKey]);

  // Return the hook interface
  return useMemo(
    () => ({
      connectionState,
      isConnected: connectionState === 'connected',
      lastMessage,
      lastCursor,
      error,
      reconnectAttempts: reconnectCount,
      connect,
      disconnect,
      subscribe,
      send,
      clearPersistedCursor,
    }),
    [
      connectionState,
      lastMessage,
      lastCursor,
      error,
      reconnectCount,
      connect,
      disconnect,
      subscribe,
      send,
      clearPersistedCursor,
    ]
  );
}

/**
 * Hook for subscribing to specific event types with automatic cleanup
 */
export function useWebSocketEvent<T extends WebSocketEventType>(
  socket: ReturnType<typeof useWebSocket> | null,
  eventType: T,
  handler: WebSocketEventHandler<T>
) {
  useEffect(() => {
    if (!socket?.isConnected) return;

    const unsubscribe = socket.subscribe(eventType, handler);
    return () => {
      unsubscribe();
    };
  }, [socket, eventType, handler]);
}