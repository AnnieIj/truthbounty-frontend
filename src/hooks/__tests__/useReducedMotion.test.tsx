import { renderHook, act } from '@testing-library/react';
import { usePrefersReducedMotion, prefersReducedMotion } from '../useReducedMotion';

type Listener = (e: { matches: boolean }) => void;

describe('usePrefersReducedMotion', () => {
  const originalMatchMedia = window.matchMedia;
  let listeners: Set<Listener>;
  let currentMatches: boolean;

  const installMatchMedia = () => {
    listeners = new Set();
    currentMatches = false;
    window.matchMedia = jest.fn().mockImplementation((query: string) => {
      const mql = {
        matches: currentMatches,
        media: query,
        onchange: null,
        addEventListener: (_: string, cb: Listener) => listeners.add(cb),
        removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      };
      return mql;
    }) as unknown as typeof window.matchMedia;
  };

  beforeEach(() => {
    installMatchMedia();
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('returns false when the media query does not match', () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it('returns true when prefers-reduced-motion: reduce is active', () => {
    currentMatches = true;
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it('reacts to changes in the media query', () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      currentMatches = true;
      listeners.forEach((cb) => cb({ matches: true }));
    });
    expect(result.current).toBe(true);

    act(() => {
      currentMatches = false;
      listeners.forEach((cb) => cb({ matches: false }));
    });
    expect(result.current).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => usePrefersReducedMotion());
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });

  it('prefersReducedMotion() plain snapshot works outside React', () => {
    currentMatches = true;
    expect(prefersReducedMotion()).toBe(true);
    currentMatches = false;
    expect(prefersReducedMotion()).toBe(false);
  });

  it('falls back to false when matchMedia is unavailable', () => {
    // Simulate an environment without matchMedia
    const original = window.matchMedia;
    (window as unknown as { matchMedia?: unknown }).matchMedia = undefined;
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    window.matchMedia = original;
  });
});
