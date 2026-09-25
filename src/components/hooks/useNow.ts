'use client';

import { useSyncExternalStore } from 'react';

const DEFAULT_TICK_MS = 30_000;

let currentMs = Date.now();
let timerId: ReturnType<typeof setInterval> | null = null;

function subscribe(callback: () => void): () => void {
  if (timerId === null) {
    currentMs = Date.now();
    timerId = setInterval(() => {
      currentMs = Date.now();
      callback();
    }, DEFAULT_TICK_MS);
  }

  return () => {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  };
}

function getSnapshot(): number {
  return currentMs;
}

/**
 * Reactive snapshot of the wall clock used only to refresh *display* context
 * (e.g. "expires soon" hints and absolute timestamps). Lifecycle state is
 * never derived from this clock alone — it comes from canonical chain
 * projections and confirmed receipts via `protocol-time`.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}