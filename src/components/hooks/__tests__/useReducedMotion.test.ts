// src/components/hooks/__tests__/useReducedMotion.test.ts

import { renderHook, act } from '@testing-library/react';
import { useReducedMotion } from '../useReducedMotion';

/**
 * Helper that creates a mock MediaQueryList and registers it so
 * window.matchMedia returns it for the reduced-motion query.
 */
function createMockMediaQuery(matches: boolean) {
  const listeners: ((event: MediaQueryListEvent) => void)[] = [];

  const mediaQuery: Partial<MediaQueryList> & {
    _triggerChange: (newMatches: boolean) => void;
  } = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: jest.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change') {
        listeners.push(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
    _triggerChange(newMatches: boolean) {
      const event = { matches: newMatches } as MediaQueryListEvent;
      listeners.forEach((cb) => cb(event));
    },
  };

  return mediaQuery;
}

describe('useReducedMotion', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: originalMatchMedia,
    });
    jest.clearAllMocks();
  });

  it('returns false when prefers-reduced-motion does not match', () => {
    const mock = createMockMediaQuery(false);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockReturnValue(mock),
    });

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('returns true when prefers-reduced-motion matches', () => {
    const mock = createMockMediaQuery(true);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockReturnValue(mock),
    });

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('updates when the media query changes from false to true', () => {
    const mock = createMockMediaQuery(false);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockReturnValue(mock),
    });

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      mock._triggerChange(true);
    });

    expect(result.current).toBe(true);
  });

  it('updates when the media query changes from true to false', () => {
    const mock = createMockMediaQuery(true);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockReturnValue(mock),
    });

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);

    act(() => {
      mock._triggerChange(false);
    });

    expect(result.current).toBe(false);
  });

  it('removes the event listener on unmount', () => {
    const mock = createMockMediaQuery(false);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockReturnValue(mock),
    });

    const { unmount } = renderHook(() => useReducedMotion());
    unmount();

    expect(mock.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('uses the correct media query string', () => {
    const matchMediaSpy = jest.fn().mockReturnValue(createMockMediaQuery(false));
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaSpy,
    });

    renderHook(() => useReducedMotion());

    expect(matchMediaSpy).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});
