/**
 * V2-FE-048 — Session rotation, expiry, and revocation policy.
 *
 * Pure, framework-free rules for evaluating SIWE session health, classifying
 * refresh failures, and exchanging cross-tab synchronization messages.
 *
 * Canonical `expiresAt` from the server session drives lifecycle state — never
 * a client-guessed TTL. No React, no network, no storage, no randomness.
 */

import type { SiweSession } from './siwe-types';
import { isSessionActive } from './session-store';

/** Refresh a session once it is within this window of expiry. */
export const DEFAULT_REFRESH_WINDOW_MS = 60_000;

export type SessionHealth =
  /** No session at all. */
  | 'none'
  /** Session is valid and comfortably before expiry. */
  | 'active'
  /** Session is valid but within the refresh window. */
  | 'refresh-due'
  /** Session has reached its server-issued expiry. */
  | 'expired'
  /** Session payload is malformed/untrusted. */
  | 'invalid';

function isValidSessionShape(session: SiweSession): boolean {
  return (
    typeof session.address === 'string' &&
    session.address.length > 0 &&
    typeof session.token === 'string' &&
    session.token.length > 0 &&
    typeof session.chainId === 'number' &&
    Number.isFinite(session.chainId) &&
    typeof session.expiresAt === 'number' &&
    Number.isFinite(session.expiresAt) &&
    typeof session.issuedAt === 'number' &&
    Number.isFinite(session.issuedAt)
  );
}

/**
 * Evaluate session health from the canonical server-issued `expiresAt`.
 * `refreshWindowMs` controls how early a refresh becomes due.
 */
export function evaluateSessionHealth(
  session: SiweSession | null | undefined,
  now: number = Date.now(),
  refreshWindowMs: number = DEFAULT_REFRESH_WINDOW_MS,
): SessionHealth {
  if (!session) return 'none';
  if (!isValidSessionShape(session)) return 'invalid';
  if (!isSessionActive(session, now)) return 'expired';

  const window = Math.max(0, refreshWindowMs);
  if (session.expiresAt - now <= window) return 'refresh-due';
  return 'active';
}

/** Milliseconds until the session expires (never negative). */
export function sessionExpiresInMs(
  session: SiweSession | null | undefined,
  now: number = Date.now(),
): number {
  if (!session || !Number.isFinite(session.expiresAt)) return 0;
  return Math.max(0, session.expiresAt - now);
}

// ---------------------------------------------------------------------------
// Refresh failure classification
// ---------------------------------------------------------------------------

export type SessionRefreshFailureKind =
  /** Server says the session/token expired. */
  | 'EXPIRED'
  /** The token was already rotated elsewhere (reuse detected). */
  | 'REUSED'
  /** The session was explicitly revoked. */
  | 'REVOKED'
  /** Signature/session failed authorization. */
  | 'UNAUTHORIZED'
  /** Transient transport failure — retryable. */
  | 'NETWORK'
  /** Malformed response/config — fail closed. */
  | 'INVALID';

export interface SessionRefreshFailure {
  readonly kind: SessionRefreshFailureKind;
  readonly message: string;
  readonly code?: string;
}

const TERMINAL_FAILURES: ReadonlySet<SessionRefreshFailureKind> = new Set([
  'EXPIRED',
  'REUSED',
  'REVOKED',
  'UNAUTHORIZED',
  'INVALID',
]);

/** A terminal failure requires signing out; a network failure is retryable. */
export function isTerminalRefreshFailure(kind: SessionRefreshFailureKind): boolean {
  return TERMINAL_FAILURES.has(kind);
}

/** Map an unknown refresh error into a typed, fail-closed failure. */
export function classifySessionRefreshError(err: unknown): SessionRefreshFailure {
  const e = (err ?? {}) as {
    kind?: string;
    code?: string;
    message?: string;
    httpStatus?: number;
  };
  const kind = typeof e.kind === 'string' ? e.kind : undefined;
  const code = typeof e.code === 'string' ? e.code : undefined;
  const httpStatus = typeof e.httpStatus === 'number' ? e.httpStatus : undefined;
  const haystack = `${kind ?? ''} ${code ?? ''} ${e.message ?? ''}`.toLowerCase();

  if (/reus|replay|already.?used/.test(haystack)) {
    return { kind: 'REUSED', message: 'Session token was already rotated.', code };
  }
  if (/revok/.test(haystack)) {
    return { kind: 'REVOKED', message: 'Session was revoked.', code };
  }
  if (/expir|stale|timeout/.test(haystack)) {
    return { kind: 'EXPIRED', message: 'Session expired and could not be refreshed.', code };
  }
  if (httpStatus === 401 || httpStatus === 403 || kind === 'UNAUTHORIZED') {
    return { kind: 'UNAUTHORIZED', message: 'Session is no longer authorized.', code };
  }
  if (kind === 'NETWORK' || httpStatus === 0 || httpStatus === 408 || (httpStatus ?? 0) >= 500) {
    return {
      kind: 'NETWORK',
      message: e.message || 'Could not refresh the session due to a network error.',
      code,
    };
  }
  return {
    kind: 'INVALID',
    message: e.message || 'Session refresh failed.',
    code,
  };
}

// ---------------------------------------------------------------------------
// Cross-tab synchronization
// ---------------------------------------------------------------------------

export type SessionSignedOutReason = 'manual' | 'expired' | 'revoked' | 'reused';

export type SessionSyncMessage =
  | { readonly type: 'rotated'; readonly version: 1; readonly session: SiweSession }
  | {
      readonly type: 'signed-out';
      readonly version: 1;
      readonly reason: SessionSignedOutReason;
    };

export function buildRotationMessage(session: SiweSession): SessionSyncMessage {
  return { type: 'rotated', version: 1, session };
}

export function buildSignedOutMessage(
  reason: SessionSignedOutReason,
): SessionSyncMessage {
  return { type: 'signed-out', version: 1, reason };
}

const SIGNED_OUT_REASONS: ReadonlySet<string> = new Set([
  'manual',
  'expired',
  'revoked',
  'reused',
]);

/** Validate untrusted cross-tab payloads; returns null when malformed. */
export function parseSessionSyncMessage(raw: unknown): SessionSyncMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;

  if (value.type === 'rotated') {
    const session = value.session as Partial<SiweSession> | undefined;
    if (!session || typeof session !== 'object') return null;
    if (!isValidSessionShape(session as SiweSession)) return null;
    return {
      type: 'rotated',
      version: 1,
      session: {
        address: session.address as string,
        chainId: session.chainId as number,
        token: session.token as string,
        expiresAt: session.expiresAt as number,
        issuedAt: session.issuedAt as number,
      },
    };
  }

  if (value.type === 'signed-out') {
    const reason = value.reason;
    if (typeof reason !== 'string' || !SIGNED_OUT_REASONS.has(reason)) return null;
    return { type: 'signed-out', version: 1, reason: reason as SessionSignedOutReason };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Presentation copy
// ---------------------------------------------------------------------------

export interface SessionHealthPresentation {
  readonly tone: 'info' | 'warning' | 'error';
  readonly message: string;
}

/** Accessible, non-destructive copy for the session lifecycle UI. */
export function describeSessionHealth(
  health: SessionHealth,
): SessionHealthPresentation | null {
  switch (health) {
    case 'refresh-due':
      return { tone: 'info', message: 'Your session is expiring soon.' };
    case 'expired':
      return {
        tone: 'warning',
        message: 'Your session has expired. Your work is saved — sign in again to continue.',
      };
    case 'invalid':
      return {
        tone: 'error',
        message: 'Your session was invalid and has been cleared. Sign in again to continue.',
      };
    case 'active':
    case 'none':
    default:
      return null;
  }
}

/** Accessible copy for a refresh failure. */
export function describeSessionRefreshFailure(
  failure: SessionRefreshFailure,
): SessionHealthPresentation {
  switch (failure.kind) {
    case 'NETWORK':
      return {
        tone: 'warning',
        message: 'Could not refresh your session. Your work is saved — you can retry.',
      };
    case 'REUSED':
      return {
        tone: 'error',
        message:
          'This session was replaced in another tab. Sign in again to continue securely.',
      };
    case 'REVOKED':
      return {
        tone: 'error',
        message: 'Your session was revoked. Sign in again to continue.',
      };
    case 'EXPIRED':
      return {
        tone: 'warning',
        message: 'Your session expired. Sign in again to continue.',
      };
    case 'UNAUTHORIZED':
      return {
        tone: 'error',
        message: 'Your session is no longer authorized. Sign in again to continue.',
      };
    case 'INVALID':
    default:
      return {
        tone: 'error',
        message: 'Could not verify your session. Sign in again to continue.',
      };
  }
}
