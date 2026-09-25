/**
 * Approved client boundary for persisting and rotating SIWE session material.
 *
 * The session token is the only sensitive value we hold; we persist it in
 * session-scoped storage (not persisted across browser sessions) and provide
 * explicit rotation/replacement semantics. No session material is written to
 * localStorage, which is shared across tabs and easily inspected.
 */

import type { SiweSession } from './siwe-types';

export interface SessionStore {
  get(): SiweSession | null;
  set(session: SiweSession): void;
  clear(): void;
  /** Rotate the stored session, returning the previous value (if any). */
  rotate(next: SiweSession): SiweSession | null;
}

/** Return true when a stored session has not yet reached its expiry. */
export function isSessionActive(
  session: SiweSession | null | undefined,
  now: number = Date.now(),
): session is SiweSession {
  if (!session) return false;
  if (typeof session.expiresAt !== 'number' || !Number.isFinite(session.expiresAt)) {
    return false;
  }
  return now < session.expiresAt;
}

/**
 * Return true only when an active stored session belongs to the account the
 * active wallet provider currently confirms. A session whose owner does not
 * match — or a session with no provider account at all — is stale and must not
 * be treated as authenticated.
 */
export function isSessionBoundToAccount(
  session: SiweSession | null | undefined,
  account: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!isSessionActive(session, now)) return false;
  if (!account) return false;
  return session.address.toLowerCase() === account.toLowerCase();
}

const SESSION_SCHEMA = {
  address: (v: unknown): v is string => typeof v === 'string',
  chainId: (v: unknown): v is number => typeof v === 'number',
  token: (v: unknown): v is string => typeof v === 'string',
  expiresAt: (v: unknown): v is number => typeof v === 'number',
  issuedAt: (v: unknown): v is number => typeof v === 'number',
} as const;

function parseStored(raw: string | null): SiweSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SiweSession>;
    if (
      SESSION_SCHEMA.address(parsed.address) &&
      SESSION_SCHEMA.chainId(parsed.chainId) &&
      SESSION_SCHEMA.token(parsed.token) &&
      SESSION_SCHEMA.expiresAt(parsed.expiresAt) &&
      SESSION_SCHEMA.issuedAt(parsed.issuedAt)
    ) {
      const session: SiweSession = {
        address: parsed.address,
        chainId: parsed.chainId,
        token: parsed.token,
        expiresAt: parsed.expiresAt,
        issuedAt: parsed.issuedAt,
      };
      return session;
    }
  } catch {
    // Corrupt payloads are treated as absent; do not throw in the boundary.
    return null;
  }
  return null;
}

export interface BrowserSessionStoreOptions {
  /** Storage key. Defaults to `truthbounty.siwe.session`. */
  key?: string;
  /** Storage backend. Defaults to `window.sessionStorage`. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** Overridable now() for deterministic tests. */
  now?: () => number;
}

/**
 * Create a session store backed by the provided storage object. When no
 * storage is available (e.g. SSR) the store is a no-op memory boundary.
 */
export function createBrowserSessionStore(
  options: BrowserSessionStoreOptions = {},
): SessionStore {
  const key = options.key ?? 'truthbounty.siwe.session';
  const storage = options.storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null);

  if (!storage) {
    return createMemorySessionStore();
  }
  return {
    get() {
      let raw: string | null = null;
      try {
        raw = storage.getItem(key);
      } catch {
        return null;
      }
      const session = parseStored(raw);
      return isSessionActive(session, options.now?.() ?? Date.now()) ? session : null;
    },
    set(session) {
      const value = JSON.stringify(session);
      try {
        storage.setItem(key, value);
      } catch {
        // Quota/security errors are swallowed at the boundary; the session is
        // simply not persisted and the caller is not led to believe it was.
      }
    },
    clear() {
      try {
        storage.removeItem(key);
      } catch {
        // ignore
      }
    },
    rotate(next) {
      const previous = this.get();
      // Rotation always replaces (never retains) the prior session material.
      this.set(next);
      return previous;
    },
  };
}

/** In-memory fallback used when no storage backend is available (SSR/tests). */
export function createMemorySessionStore(now: () => number = () => Date.now()): SessionStore {
  let current: SiweSession | null = null;
  return {
    get() {
      return current && isSessionActive(current, now()) ? current : null;
    },
    set(session) {
      current = session;
    },
    clear() {
      current = null;
    },
    rotate(next) {
      const previous = current;
      current = next;
      return previous;
    },
  };
}
