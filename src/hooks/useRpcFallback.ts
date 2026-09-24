'use client';

/**
 * useRpcFallback — RPC provider rotation with circuit-breaker and health tracking.
 * V2-FE-136
 *
 * Security invariants:
 * - Returns null (not fabricated state) when no provider is healthy.
 * - Fails closed on unsupported chains (no chainConfig => no transport).
 * - Does NOT expose private keys, secrets, or internal provider credentials.
 * - RPC URLs come exclusively from canonical chain config (src/config/chains.ts).
 * - Circuit opens after failureThreshold consecutive failures; closes after resetAfterMs.
 *
 * Usage:
 *   const { activeUrl, state, isUsingFallback, allUnhealthy } = useRpcFallback(chainId);
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getChainConfig, isSupportedChain } from '@/config/chains';
import type {
  RpcFallbackState,
  RpcProviderHealth,
  CircuitBreakerConfig,
} from '@/lib/rpc-fallback/types';
import {
  DEFAULT_CIRCUIT_BREAKER,
} from '@/lib/rpc-fallback/types';

export interface UseRpcFallbackOptions {
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  /** Polling interval for health probes (ms). Default 60 000. */
  probeIntervalMs?: number;
  /** If true, disable probing (useful in tests). */
  disableProbing?: boolean;
}

export interface UseRpcFallbackReturn {
  /** URL of the currently active provider. Null when circuit is open. */
  activeUrl: string | null;
  /** Full fallback state snapshot. */
  state: RpcFallbackState | null;
  /** True when the active provider is not the primary (index > 0). */
  isUsingFallback: boolean;
  /** True when ALL configured providers are unhealthy and circuit is open. */
  allUnhealthy: boolean;
  /** True when active provider is degraded (high latency/partial failures). */
  isDegraded: boolean;
  /** Manually trigger a health re-probe of all providers. */
  retryProbe: () => void;
}

function makeInitialHealth(url: string): RpcProviderHealth {
  return {
    url,
    status: 'unknown',
    lastSuccessMs: null,
    lastFailureMs: null,
    consecutiveFailures: 0,
    latencyMs: null,
  };
}

function makeInitialState(
  chainId: number,
  urls: string[],
): RpcFallbackState {
  const health: Record<string, RpcProviderHealth> = {};
  for (const url of urls) {
    health[url] = makeInitialHealth(url);
  }
  return {
    chainId,
    activeUrl: urls[0],
    activeIndex: 0,
    health,
    isUsingFallback: false,
    allUnhealthy: false,
    isDegraded: false,
    circuitOpen: false,
    circuitOpenedAt: null,
  };
}

/**
 * Probe a single RPC URL with a lightweight eth_chainId call.
 * Returns { ok, latencyMs } — never throws.
 */
async function probeRpcUrl(
  url: string,
  expectedChainId: number,
  timeoutMs: number,
): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) return { ok: false, latencyMs: Date.now() - start };

    const json = await res.json() as { result?: string };
    const returnedChainId = parseInt(json.result ?? '0', 16);
    const chainIdMatch = returnedChainId === expectedChainId;

    return { ok: chainIdMatch, latencyMs: Date.now() - start };
  } catch {
    clearTimeout(timer);
    return { ok: false, latencyMs: Date.now() - start };
  }
}

export function useRpcFallback(
  chainId: number | undefined,
  options: UseRpcFallbackOptions = {},
): UseRpcFallbackReturn {
  const cbConfig: CircuitBreakerConfig = {
    ...DEFAULT_CIRCUIT_BREAKER,
    ...options.circuitBreaker,
  };
  const probeIntervalMs = options.probeIntervalMs ?? 60_000;
  const disableProbing = options.disableProbing ?? false;

  const [fallbackState, setFallbackState] = useState<RpcFallbackState | null>(() => {
    if (!chainId || !isSupportedChain(chainId)) return null;
    try {
      const cfg = getChainConfig(chainId);
      const urls = cfg.rpcUrls?.length ? cfg.rpcUrls : [cfg.rpcUrl];
      return makeInitialState(chainId, urls);
    } catch {
      return null;
    }
  });

  // Keep a ref to the latest state to use in callbacks without stale closure
  const stateRef = useRef(fallbackState);
  useEffect(() => { stateRef.current = fallbackState; }, [fallbackState]);

  const probe = useCallback(async () => {
    if (!chainId || !isSupportedChain(chainId)) return;

    let cfg;
    try {
      cfg = getChainConfig(chainId);
    } catch {
      return;
    }

    const urls: string[] = cfg.rpcUrls?.length ? cfg.rpcUrls : [cfg.rpcUrl];
    const now = Date.now();

    // Check circuit reset
    const current = stateRef.current;
    if (current?.circuitOpen && current.circuitOpenedAt !== null) {
      if (now - current.circuitOpenedAt < cbConfig.resetAfterMs) {
        // Still within reset window; skip probe
        return;
      }
      // Half-open: allow probe to proceed
    }

    // Probe all URLs in parallel
    const results = await Promise.all(
      urls.map((url) => probeRpcUrl(url, chainId, cbConfig.probeTimeoutMs))
    );

    setFallbackState((prev) => {
      if (!prev) return prev;

      const newHealth = { ...prev.health };
      results.forEach(({ ok, latencyMs }, i) => {
        const url = urls[i];
        const old = newHealth[url] ?? makeInitialHealth(url);
        const consecutiveFailures = ok ? 0 : old.consecutiveFailures + 1;
        newHealth[url] = {
          url,
          status:
            ok
              ? 'healthy'
              : consecutiveFailures >= cbConfig.failureThreshold
              ? 'unhealthy'
              : 'degraded',
          lastSuccessMs: ok ? now : old.lastSuccessMs,
          lastFailureMs: ok ? old.lastFailureMs : now,
          consecutiveFailures,
          latencyMs: ok ? latencyMs : old.latencyMs,
        };
      });

      // Find best active index (first healthy, then first degraded, else 0)
      let bestIndex = urls.findIndex(
        (url) => newHealth[url]?.status === 'healthy',
      );
      if (bestIndex === -1) {
        bestIndex = urls.findIndex(
          (url) => newHealth[url]?.status !== 'unhealthy',
        );
      }
      if (bestIndex === -1) bestIndex = 0;

      const allUnhealthy = urls.every(
        (url) => newHealth[url]?.status === 'unhealthy',
      );
      const isDegraded = !allUnhealthy && urls.some(
        (url) => newHealth[url]?.status === 'degraded',
      );

      const shouldOpen = allUnhealthy;
      const circuitOpen = shouldOpen;
      const circuitOpenedAt = shouldOpen
        ? prev.circuitOpenedAt ?? now
        : null;

      return {
        ...prev,
        health: newHealth,
        activeIndex: bestIndex,
        activeUrl: urls[bestIndex],
        isUsingFallback: bestIndex > 0,
        allUnhealthy,
        isDegraded,
        circuitOpen,
        circuitOpenedAt,
      };
    });
  }, [chainId, cbConfig.failureThreshold, cbConfig.probeTimeoutMs, cbConfig.resetAfterMs]);

  // Re-initialise when chainId changes
  useEffect(() => {
    if (!chainId || !isSupportedChain(chainId)) {
      setFallbackState(null);
      return;
    }
    try {
      const cfg = getChainConfig(chainId);
      const urls = cfg.rpcUrls?.length ? cfg.rpcUrls : [cfg.rpcUrl];
      setFallbackState(makeInitialState(chainId, urls));
    } catch {
      setFallbackState(null);
    }
  }, [chainId]);

  // Periodic probing
  useEffect(() => {
    if (disableProbing || !chainId) return;

    // Initial probe shortly after mount
    const initialTimeout = setTimeout(() => probe(), 1_000);
    const interval = setInterval(() => probe(), probeIntervalMs);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [probe, probeIntervalMs, disableProbing, chainId]);

  return {
    activeUrl: fallbackState?.circuitOpen ? null : (fallbackState?.activeUrl ?? null),
    state: fallbackState,
    isUsingFallback: fallbackState?.isUsingFallback ?? false,
    allUnhealthy: fallbackState?.allUnhealthy ?? false,
    isDegraded: fallbackState?.isDegraded ?? false,
    retryProbe: probe,
  };
}
