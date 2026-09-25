import {
  createBrowserSessionStore,
  createMemorySessionStore,
  isSessionActive,
  isSessionBoundToAccount,
} from '../session-store';
import type { SiweSession } from '../siwe-types';

const NOW = Date.parse('2026-08-31T12:00:00.000Z');

function makeSession(overrides: Partial<SiweSession> = {}): SiweSession {
  return {
    address: '0x742d35cc6634c0532925a3b844bc9e7595f0eb1e',
    chainId: 10,
    token: 'token-123',
    expiresAt: NOW + 60_000,
    issuedAt: NOW,
    ...overrides,
  };
}

describe('isSessionActive', () => {
  it('returns false for null/undefined', () => {
    expect(isSessionActive(null, NOW)).toBe(false);
    expect(isSessionActive(undefined, NOW)).toBe(false);
  });

  it('returns true before expiry', () => {
    expect(isSessionActive(makeSession(), NOW)).toBe(true);
  });

  it('returns false after expiry', () => {
    expect(isSessionActive(makeSession({ expiresAt: NOW - 1 }), NOW)).toBe(false);
  });
});

describe('isSessionBoundToAccount', () => {
  const OTHER = '0x1111111111111111111111111111111111111111';

  it('binds an active session to the matching account (case-insensitive)', () => {
    const session = makeSession();
    expect(isSessionBoundToAccount(session, session.address, NOW)).toBe(true);
    expect(isSessionBoundToAccount(session, session.address.toUpperCase(), NOW)).toBe(true);
  });

  it('rejects a session whose owner does not match the provider account', () => {
    expect(isSessionBoundToAccount(makeSession(), OTHER, NOW)).toBe(false);
  });

  it('rejects when there is no confirmed provider account', () => {
    expect(isSessionBoundToAccount(makeSession(), null, NOW)).toBe(false);
    expect(isSessionBoundToAccount(makeSession(), undefined, NOW)).toBe(false);
    expect(isSessionBoundToAccount(makeSession(), '', NOW)).toBe(false);
  });

  it('rejects an expired session even when the account matches', () => {
    const expired = makeSession({ expiresAt: NOW - 1 });
    expect(isSessionBoundToAccount(expired, expired.address, NOW)).toBe(false);
  });

  it('rejects a missing session', () => {
    expect(isSessionBoundToAccount(null, '0xabc', NOW)).toBe(false);
    expect(isSessionBoundToAccount(undefined, '0xabc', NOW)).toBe(false);
  });
});

describe('createBrowserSessionStore', () => {
  function makeStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      _map: map,
    };
  }

  it('stores, reads, and clears a session through the boundary', () => {
    const storage = makeStorage();
    const store = createBrowserSessionStore({ storage, now: () => NOW });

    expect(store.get()).toBeNull();

    store.set(makeSession());
    expect(store.get()?.token).toBe('token-123');

    store.clear();
    expect(store.get()).toBeNull();
  });

  it('returns null once the stored session expires', () => {
    const storage = makeStorage();
    const store = createBrowserSessionStore({ storage, now: () => NOW });
    store.set(makeSession({ expiresAt: NOW + 1000 }));

    const later = createBrowserSessionStore({ storage, key: 'truthbounty.siwe.session', now: () => NOW + 5000 });
    expect(later.get()).toBeNull();
  });

  it('rotates session material, replacing the previous value', () => {
    const storage = makeStorage();
    const store = createBrowserSessionStore({ storage, now: () => NOW });
    store.set(makeSession({ token: 'old' }));

    const prev = store.rotate(makeSession({ token: 'new' }));
    expect(prev?.token).toBe('old');
    expect(store.get()?.token).toBe('new');
  });

  it('ignores corrupt payloads (treated as absent)', () => {
    const storage = makeStorage();
    storage.setItem('truthbounty.siwe.session', '{not json');
    const store = createBrowserSessionStore({ storage, now: () => NOW });
    expect(store.get()).toBeNull();
  });

  it('drops sessions with an invalid schema', () => {
    const storage = makeStorage();
    storage.setItem('truthbounty.siwe.session', JSON.stringify({ token: 'x' }));
    const store = createBrowserSessionStore({ storage, now: () => NOW });
    expect(store.get()).toBeNull();
  });
});

describe('createMemorySessionStore', () => {
  it('provides get/set/clear/rotate without a storage backend', () => {
    const store = createMemorySessionStore(() => NOW);
    expect(store.get()).toBeNull();
    store.set(makeSession());
    expect(store.get()?.token).toBe('token-123');
    store.clear();
    expect(store.get()).toBeNull();
  });

  it('never returns an expired session', () => {
    const store = createMemorySessionStore(() => NOW);
    store.set(makeSession({ expiresAt: NOW - 1 }));
    expect(store.get()).toBeNull();
  });
});
