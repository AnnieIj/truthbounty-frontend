'use client';

import { useSyncExternalStore } from 'react';

/**
 * V2-FE-071 — Reduced motion & cognitive accessibility utilities.
 *
 * Motion must never be the *only* carrier of meaning: status comprehension
 * has to survive with every animation disabled, and time-sensitive actions
 * have to stay understandable without motion cues. This module provides the
 * client-side half of that guarantee (the CSS half lives in `globals.css`
 * under `@media (prefers-reduced-motion: reduce)`).
 *
 * No protocol, wallet, or settlement semantics live here — Wagmi/Viem and
 * canonical Optimism/EVM receipts remain authoritative for protocol state.
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Server snapshot constant — no window access, no hydration mismatch. */
const SSR_SNAPSHOT = false;

function subscribeToReducedMotion(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return SSR_SNAPSHOT;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * React binding for `prefers-reduced-motion`.
 * Returns `true` when the user asked the OS to minimize non-essential motion.
 *
 * SSR-safe: resolves to `false` during server render and first paint, then
 * re-synchronizes from the media query without hydration mismatches.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    () => SSR_SNAPSHOT,
  );
}

/**
 * Utility for consumers that need a plain snapshot outside React
 * (e.g. imperative focus management before starting a countdown).
 */
export function prefersReducedMotion(): boolean {
  return getReducedMotionSnapshot();
}
