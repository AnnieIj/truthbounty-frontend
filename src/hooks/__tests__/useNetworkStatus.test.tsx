import { act, renderHook } from '@testing-library/react';
import { useNetworkStatus, readLowBandwidth } from '../useNetworkStatus';

const mockConnection = (connection: unknown) => {
  Object.defineProperty(window.navigator, 'connection', {
    configurable: true,
    value: connection,
  });
};

const setOnline = (online: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
};

describe('useNetworkStatus', () => {
  afterEach(() => {
    setOnline(true);
    mockConnection(undefined);
    jest.restoreAllMocks();
  });

  it('reports online by default', () => {
    setOnline(true);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
    expect(result.current.isLowBandwidth).toBe(false);
  });

  it('flips to offline when the browser goes offline', () => {
    setOnline(true);
    const { result } = renderHook(() => useNetworkStatus());
    act(() => setOnline(false));
    expect(result.current.isOnline).toBe(false);
  });

  it('returns online after the browser reconnects', () => {
    setOnline(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);
    act(() => setOnline(true));
    expect(result.current.isOnline).toBe(true);
  });

  it('detects save-data as low bandwidth', () => {
    const listeners: Record<string, Array<() => void>> = {};
    mockConnection({
      saveData: true,
      effectiveType: '4g',
      addEventListener: (type: string, listener: () => void) => {
        listeners[type] = listeners[type] ?? [];
        listeners[type].push(listener);
      },
      removeEventListener: jest.fn(),
    });

    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.saveData).toBe(true);
    expect(result.current.isLowBandwidth).toBe(true);
  });

  it('detects slow effectiveType as low bandwidth', () => {
    mockConnection({ saveData: false, effectiveType: '2g' });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.effectiveType).toBe('2g');
    expect(result.current.isLowBandwidth).toBe(true);
  });

  it('treats 4g without save-data as normal bandwidth', () => {
    mockConnection({ saveData: false, effectiveType: '4g' });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isLowBandwidth).toBe(false);
  });
});

describe('readLowBandwidth', () => {
  it('returns false without connection info', () => {
    expect(readLowBandwidth(null)).toBe(false);
  });

  it('returns true for saveData', () => {
    expect(readLowBandwidth({ saveData: true, effectiveType: '4g' })).toBe(true);
  });

  it('returns true for slow-2g', () => {
    expect(readLowBandwidth({ saveData: false, effectiveType: 'slow-2g' })).toBe(true);
  });

  it('returns false for 4g', () => {
    expect(readLowBandwidth({ saveData: false, effectiveType: '4g' })).toBe(false);
  });
});
