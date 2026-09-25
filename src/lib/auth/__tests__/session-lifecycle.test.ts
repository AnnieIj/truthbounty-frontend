/**
 * V2-FE-048 — Session lifecycle policy (pure unit tests).
 */

import {
  buildRotationMessage,
  buildSignedOutMessage,
  classifySessionRefreshError,
  describeSessionHealth,
  describeSessionRefreshFailure,
  evaluateSessionHealth,
  isTerminalRefreshFailure,
  parseSessionSyncMessage,
  sessionExpiresInMs,
} from '../session-lifecycle';
import type { SiweSession } from '../siwe-types';

const NOW = Date.parse('2026-08-31T12:00:00.000Z');

function makeSession(overrides: Partial<SiweSession> = {}): SiweSession {
  return {
    address: '0x742d35cc6634c0532925a3b844bc9e7595f0eb1e',
    chainId: 10,
    token: 'token-1',
    expiresAt: NOW + 3_600_000,
    issuedAt: NOW,
    ...overrides,
  };
}

describe('evaluateSessionHealth', () => {
  it('reports none without a session', () => {
    expect(evaluateSessionHealth(null, NOW, 60_000)).toBe('none');
    expect(evaluateSessionHealth(undefined, NOW, 60_000)).toBe('none');
  });

  it('reports invalid for malformed sessions', () => {
    expect(
      evaluateSessionHealth({ token: '' } as unknown as SiweSession, NOW, 60_000),
    ).toBe('invalid');
  });

  it('reports active well before expiry', () => {
    expect(evaluateSessionHealth(makeSession(), NOW, 60_000)).toBe('active');
  });

  it('reports refresh-due within the refresh window', () => {
    expect(
      evaluateSessionHealth(makeSession({ expiresAt: NOW + 30_000 }), NOW, 60_000),
    ).toBe('refresh-due');
  });

  it('reports expired at or after expiresAt (canonical, no guessing)', () => {
    expect(
      evaluateSessionHealth(makeSession({ expiresAt: NOW - 1 }), NOW, 60_000),
    ).toBe('expired');
    expect(
      evaluateSessionHealth(makeSession({ expiresAt: NOW }), NOW, 60_000),
    ).toBe('expired');
  });
});

describe('sessionExpiresInMs', () => {
  it('never returns a negative value', () => {
    expect(sessionExpiresInMs(makeSession({ expiresAt: NOW + 500 }), NOW)).toBe(500);
    expect(sessionExpiresInMs(makeSession({ expiresAt: NOW - 500 }), NOW)).toBe(0);
    expect(sessionExpiresInMs(null, NOW)).toBe(0);
  });
});

describe('classifySessionRefreshError', () => {
  it('detects reuse/replay', () => {
    expect(classifySessionRefreshError({ kind: 'REPLAYED' }).kind).toBe('REUSED');
    expect(classifySessionRefreshError({ message: 'token already used' }).kind).toBe('REUSED');
  });

  it('detects revocation', () => {
    expect(classifySessionRefreshError({ code: 'revoked' }).kind).toBe('REVOKED');
  });

  it('detects expiry', () => {
    expect(classifySessionRefreshError({ kind: 'NONCE_EXPIRED' }).kind).toBe('EXPIRED');
  });

  it('maps 401/403 to unauthorized', () => {
    expect(classifySessionRefreshError({ httpStatus: 401 }).kind).toBe('UNAUTHORIZED');
    expect(classifySessionRefreshError({ httpStatus: 403 }).kind).toBe('UNAUTHORIZED');
  });

  it('maps transport failures to retryable network errors', () => {
    expect(classifySessionRefreshError({ kind: 'NETWORK' }).kind).toBe('NETWORK');
    expect(classifySessionRefreshError({ httpStatus: 500 }).kind).toBe('NETWORK');
    expect(classifySessionRefreshError({ httpStatus: 0 }).kind).toBe('NETWORK');
  });

  it('falls back to INVALID', () => {
    expect(classifySessionRefreshError({}).kind).toBe('INVALID');
  });
});

describe('isTerminalRefreshFailure', () => {
  it('treats everything but network as terminal', () => {
    expect(isTerminalRefreshFailure('NETWORK')).toBe(false);
    expect(isTerminalRefreshFailure('REUSED')).toBe(true);
    expect(isTerminalRefreshFailure('REVOKED')).toBe(true);
    expect(isTerminalRefreshFailure('EXPIRED')).toBe(true);
    expect(isTerminalRefreshFailure('UNAUTHORIZED')).toBe(true);
    expect(isTerminalRefreshFailure('INVALID')).toBe(true);
  });
});

describe('session sync messages', () => {
  it('round-trips a rotation message', () => {
    const session = makeSession();
    const parsed = parseSessionSyncMessage(buildRotationMessage(session));
    expect(parsed).toEqual({ type: 'rotated', version: 1, session });
  });

  it('round-trips a signed-out message', () => {
    expect(parseSessionSyncMessage(buildSignedOutMessage('revoked'))).toEqual({
      type: 'signed-out',
      version: 1,
      reason: 'revoked',
    });
  });

  it('rejects malformed / untrusted payloads', () => {
    expect(parseSessionSyncMessage(null)).toBeNull();
    expect(parseSessionSyncMessage({ type: 'rotated', session: { token: 'x' } })).toBeNull();
    expect(parseSessionSyncMessage({ type: 'signed-out', reason: 'hacked' })).toBeNull();
    expect(parseSessionSyncMessage({ type: 'unknown' })).toBeNull();
  });
});

describe('presentation copy', () => {
  it('describes non-healthy lifecycle states', () => {
    expect(describeSessionHealth('active')).toBeNull();
    expect(describeSessionHealth('none')).toBeNull();
    expect(describeSessionHealth('refresh-due')?.tone).toBe('info');
    expect(describeSessionHealth('expired')?.message).toMatch(/work is saved/i);
    expect(describeSessionHealth('invalid')?.tone).toBe('error');
  });

  it('describes refresh failures without promising data loss', () => {
    expect(describeSessionRefreshFailure(classifySessionRefreshError({ kind: 'NETWORK' })).message).toMatch(
      /work is saved/i,
    );
    expect(describeSessionRefreshFailure({ kind: 'REUSED', message: 'x' }).message).toMatch(
      /another tab/i,
    );
  });
});
