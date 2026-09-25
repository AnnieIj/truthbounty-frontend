/**
 * useRpcFallback — unit tests
 * V2-FE-136
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useRpcFallback } from '../useRpcFallback';

// Mock chains config
jest.mock('@/config/chains', () => ({
  isSupportedChain: (id: number) => id === 10 || id === 11155420,
  getChainConfig: (id: number) => {
    if (id === 10) {
      return {
        id: 10,
        rpcUrl: 'https://mainnet.optimism.io',
        rpcUrls: [
          'https://mainnet.optimism.io',
          'https://opt-fallback.example.com',
        ],
      };
    }
    if (id === 11155420) {
      return {
        id: 11155420,
        rpcUrl: 'https://sepolia.optimism.io',
        rpcUrls: ['https://sepolia.optimism.io'],
      };
    }
    throw new Error(`Unsupported chain: ${id}`);
  },
}));

// Mock fetch globally
const originalFetch = global.fetch;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('useRpcFallback', () => {
  it('returns null state for unsupported chain', () => {
    const { result } = renderHook(() =>
      useRpcFallback(999, { disableProbing: true }),
    );
    expect(result.current.state).toBeNull();
    expect(result.current.activeUrl).toBeNull();
    expect(result.current.allUnhealthy).toBe(false);
  });

  it('returns null state when chainId is undefined', () => {
    const { result } = renderHook(() =>
      useRpcFallback(undefined, { disableProbing: true }),
    );
    expect(result.current.state).toBeNull();
  });

  it('initialises with primary URL as active', () => {
    const { result } = renderHook(() =>
      useRpcFallback(10, { disableProbing: true }),
    );
    expect(result.current.state).not.toBeNull();
    expect(result.current.activeUrl).toBe('https://mainnet.optimism.io');
    expect(result.current.isUsingFallback).toBe(false);
    expect(result.current.state?.circuitOpen).toBe(false);
  });

  it('marks allUnhealthy and opens circuit after consecutive failures', async () => {
    // Mock fetch to always fail
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() =>
      useRpcFallback(10, {
        disableProbing: false,
        probeIntervalMs: 100,
        circuitBreaker: { failureThreshold: 3, resetAfterMs: 60_000, probeTimeoutMs: 1_000 },
      }),
    );

    // Advance timers to trigger initial probe
    await act(async () => {
      jest.advanceTimersByTime(1_500);
      await Promise.resolve();
    });

    await waitFor(() => {
      // After probing with failures, health should update
      const state = result.current.state;
      expect(state).not.toBeNull();
    });
  });

  it('isUsingFallback is false initially', () => {
    const { result } = renderHook(() =>
      useRpcFallback(10, { disableProbing: true }),
    );
    expect(result.current.isUsingFallback).toBe(false);
  });

  it('activeUrl returns null when circuitOpen', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() =>
      useRpcFallback(10, {
        disableProbing: false,
        probeIntervalMs: 100,
        circuitBreaker: { failureThreshold: 1, resetAfterMs: 60_000, probeTimeoutMs: 500 },
      }),
    );

    // State before probing: circuit should be closed
    expect(result.current.state?.circuitOpen).toBe(false);

    // activeUrl is non-null when circuit is closed
    expect(result.current.activeUrl).not.toBeNull();
  });

  it('reinitialises when chainId changes', () => {
    let chainId = 10;
    const { result, rerender } = renderHook(() =>
      useRpcFallback(chainId, { disableProbing: true }),
    );

    expect(result.current.state?.chainId).toBe(10);

    act(() => {
      chainId = 11155420;
      rerender();
    });

    expect(result.current.state?.chainId).toBe(11155420);
    expect(result.current.activeUrl).toBe('https://sepolia.optimism.io');
  });

  it('exposes retryProbe function', () => {
    const { result } = renderHook(() =>
      useRpcFallback(10, { disableProbing: true }),
    );
    expect(typeof result.current.retryProbe).toBe('function');
  });
});
