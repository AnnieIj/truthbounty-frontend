/**
 * EIP-4361 (Sign-In With Ethereum) client boundary.
 *
 * Responsibilities (scope-aligned, no synthetic state):
 *  - Request the backend-generated SIWE challenge.
 *  - Parse the exact message so the client can validate signer/chain/nonce
 *    against the currently connected wallet *before* prompting for a
 *    signature (never fabricating a challenge or signature).
 *  - Submit the exact message + wallet signature unchanged to the backend.
 *  - Classify backend responses into a small, typed failure taxonomy so the
 *    UI and tests can reason about nonce expiry, rejection, wrong account,
 *    wrong chain, and replay.
 *
 * The backend remains the authority for all cryptographic verification. The
 * frontend only performs defensive, non-fabricating checks.
 */

import type {
  SiweChallenge,
  SiweFailure,
  SiweFailureKind,
  SiweVerifyRequest,
} from './siwe-types';

export const SIWE_VERSION = '1';

/** A transport-agnostic API boundary for the SIWE backend endpoints. */
export interface SiweApiClient {
  requestChallenge(opts: {
    address: string;
    chainId: number;
  }): Promise<SiweChallenge>;
  submitVerification(req: SiweVerifyRequest): Promise<{
    token: string;
    expiresAt: string;
    address: string;
    chainId: number;
  }>;
  revokeSession(opts: { token?: string }): Promise<void>;
}

/**
 * Parse an EIP-4361 message into a structured `SiweChallenge` fragment.
 *
 * This is a loss-less field extractor used purely for validation; the original
 * `message` string is always what we display and submit. Returns `null` when
 * the message is not a well-formed EIP-4361 message.
 */
export function parseSiweMessage(message: string): Omit<SiweChallenge, 'message'> | null {
  if (!message || typeof message !== 'string') return null;

  // Domain line + the EIP-4361 header, capturing the signer address on the
  // line immediately following the header.
  const headerMatch = message.match(
    /^(.+)\s+wants you to sign in with your Ethereum account:\s*\r?\n\s*([0-9a-fA-Fx]{40,42})/m,
  );
  if (!headerMatch?.[1] || !headerMatch[2]) return null;
  const domain = headerMatch[1].trim();
  const address = headerMatch[2].toLowerCase();

  const chainMatch = message.match(/^Chain ID:\s*(\d+)\s*$/m);
  const nonceMatch = message.match(/^Nonce:\s*([A-Za-z0-9_-]+)\s*$/m);
  const issuedAtMatch = message.match(/^Issued At:\s*([^\s].*?)\s*$/m);
  const expirationMatch = message.match(/^Expiration Time:\s*([^\s].*?)\s*$/m);
  const uriMatch = message.match(/^URI:\s*(\S+)\s*$/m);
  const versionMatch = message.match(/^Version:\s*(\S+)\s*$/m);

  if (!chainMatch?.[1] || !nonceMatch?.[1]) return null;

  const chainId = Number(chainMatch[1]);
  if (!Number.isInteger(chainId) || chainId <= 0) return null;

  const issuedAt = issuedAtMatch?.[1] ?? '';
  const expirationTime = expirationMatch?.[1] ?? '';

  return {
    address,
    chainId,
    nonce: nonceMatch[1],
    issuedAt,
    expirationTime,
    domain,
    uri: uriMatch?.[1] ?? '',
    version: versionMatch?.[1] ?? SIWE_VERSION,
  };
}

/** Compare two Ethereum addresses case-insensitively. */
export function addressesEqual(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export interface FreshnessResult {
  kind: SiweFailureKind | null;
  expired: boolean;
}

/**
 * Determine whether the challenge is stale for signing. Uses wall-clock time
 * and, when present, the message's `expirationTime`. Never fabricates a nonce.
 */
export function isChallengeFresh(
  challenge: { expirationTime?: string; issuedAt?: string },
  now: number = Date.now(),
): FreshnessResult {
  if (challenge.expirationTime) {
    const expiresMs = Date.parse(challenge.expirationTime);
    if (!Number.isNaN(expiresMs)) {
      if (now >= expiresMs) {
        return { kind: 'NONCE_EXPIRED', expired: true };
      }
    }
  }
  return { kind: null, expired: false };
}

/**
 * Validate the challenge against the currently connected wallet. Returns a
 * typed failure when the signer account or chain does not match the message,
 * otherwise `null`. These checks run before a signature prompt is shown.
 */
export function validateChallengeAgainstWallet(
  challenge: Omit<SiweChallenge, 'message'>,
  opts: { address?: string | null; chainId?: number | null },
): SiweFailure | null {
  if (!addressesEqual(challenge.address, opts.address)) {
    return {
      kind: 'WRONG_ACCOUNT',
      message: 'The connected account does not match the signer requested by the challenge.',
    };
  }
  if (typeof opts.chainId === 'number' && opts.chainId !== challenge.chainId) {
    return {
      kind: 'WRONG_CHAIN',
      message: 'The connected network does not match the network requested by the challenge.',
    };
  }
  return null;
}

export interface ValidateChallengeOutcome {
  failure: SiweFailure | null;
  parsed: Omit<SiweChallenge, 'message'> | null;
}

/**
 * Validate a backend challenge end-to-end: well-formed EIP-4361 message,
 * freshness (nonce expiry) and matching wallet account/chain.
 */
export function validateChallenge(
  challenge: SiweChallenge,
  opts: { address?: string | null; chainId?: number | null; now?: number },
): ValidateChallengeOutcome {
  const parsed = parseSiweMessage(challenge.message);
  if (!parsed) {
    return {
      parsed: null,
      failure: {
        kind: 'INVALID_MESSAGE',
        message: 'The backend returned a malformed SIWE message.',
      },
    };
  }

  if (!addressesEqual(parsed.address, challenge.address)) {
    return {
      parsed,
      failure: {
        kind: 'INVALID_MESSAGE',
        message: 'The challenge address does not match the message.',
      },
    };
  }

  const freshness = isChallengeFresh(challenge, opts.now);
  if (freshness.kind) {
    return {
      parsed,
      failure: {
        kind: freshness.kind,
        message: 'The challenge nonce has expired; request a new challenge and retry.',
      },
    };
  }

  const walletFailure = validateChallengeAgainstWallet(parsed, opts);
  if (walletFailure) {
    return { parsed, failure: walletFailure };
  }

  return { parsed, failure: null };
}

/** Map a backend HTTP status + payload into a typed SIWE failure. */
export function classifySiweHttpError(status: number, body?: unknown): SiweFailure {
  const code = extractErrorCode(body);
  const message =
    extractErrorMessage(body) ?? `SIWE request failed with HTTP ${status}.`;

  // 409 Conflict / 410 Gone: the nonce/signature was already used (replay) or
  // the challenge has been invalidated → treat as replay.
  if (status === 409 || status === 410) {
    return { kind: 'REPLAYED', message, code };
  }
  // 401 Unauthorized: the provided signature/session failed verification.
  if (status === 401) {
    const k: SiweFailureKind =
      code === 'nonce_expired' || isExpiredCode(code) ? 'NONCE_EXPIRED' : 'UNAUTHORIZED';
    return { kind: k, message, code };
  }
  // 400 Bad Request: explicit backend-side expiry/replay markers.
  if (status === 400) {
    const k: SiweFailureKind = isExpiredCode(code)
      ? 'NONCE_EXPIRED'
      : code === 'replay' || code === 'replayed'
        ? 'REPLAYED'
        : 'INVALID_MESSAGE';
    return { kind: k, message, code };
  }
  return { kind: 'NETWORK', message, code };
}

function isExpiredCode(code: string | undefined): boolean {
  return !!code && /expire|expir|stale|timeout/i.test(code);
}

function extractErrorCode(body: unknown): string | undefined {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b.code === 'string') return b.code;
    if (typeof b.error === 'string') return b.error;
    if (typeof b.error === 'object' && b.error) {
      const e = b.error as Record<string, unknown>;
      if (typeof e.code === 'string') return e.code;
    }
  }
  return undefined;
}

function extractErrorMessage(body: unknown): string | undefined {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b.message === 'string') return b.message;
    if (typeof b.error === 'string') return b.error;
    if (typeof b.error === 'object' && b.error) {
      const e = b.error as Record<string, unknown>;
      if (typeof e.message === 'string') return e.message;
    }
  }
  return undefined;
}

/**
 * Build a fetch-based SIWE API client for the TruthBounty backend.
 *
 * The base URL is the approved external API origin (NEXT_PUBLIC_API_URL). No
 * credentials/secrets are embedded; the caller supplies the bearer session
 * token when required by the transport.
 */
export function createSiweApiClient(baseUrl: string, fetchImpl: typeof fetch = fetch): SiweApiClient {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}`;

  async function post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${endpoint}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
    } catch (err) {
      const e = err as Error;
      throw Object.assign(new Error(`SIWE request failed: ${e?.message ?? 'network error'}`), {
        kind: 'NETWORK' as const,
        httpStatus: 0,
      });
    }

    let payload: unknown = null;
    if (res.status !== 204) {
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
    }

    if (!res.ok) {
      const failure = classifySiweHttpError(res.status, payload);
      throw Object.assign(new Error(failure.message), {
        kind: failure.kind as SiweFailureKind,
        code: failure.code,
        httpStatus: res.status,
      });
    }

    return payload as T;
  }

  return {
    async requestChallenge(opts) {
      const raw = await post<Record<string, unknown>>('/auth/siwe/challenge', {
        address: opts.address,
        chainId: opts.chainId,
      });
      return normalizeChallenge(raw);
    },
    async submitVerification(req) {
      const raw = await post<Record<string, unknown>>('/auth/siwe/verify', req);
      return normalizeVerifyResponse(raw);
    },
    async revokeSession(opts) {
      await post<void>('/auth/siwe/revoke', { token: opts.token });
    },
  };
}

function normalizeChallenge(raw: Record<string, unknown>): SiweChallenge {
  const message = raw?.message;
  const nonce = raw?.nonce;
  const address = raw?.address;
  const chainId = raw?.chainId;
  const domain = raw?.domain;
  const uri = raw?.uri;
  const issuedAt = raw?.issuedAt;
  const expirationTime = raw?.expirationTime;

  if (typeof message !== 'string' || !message) {
    throw Object.assign(new Error('Malformed SIWE challenge: missing message.'), {
      kind: 'INVALID_MESSAGE' as const,
      httpStatus: 0,
    });
  }
  if (typeof nonce !== 'string' || !nonce) {
    throw Object.assign(new Error('Malformed SIWE challenge: missing nonce.'), {
      kind: 'INVALID_MESSAGE' as const,
      httpStatus: 0,
    });
  }
  if (typeof address !== 'string' || !address) {
    throw Object.assign(new Error('Malformed SIWE challenge: missing address.'), {
      kind: 'INVALID_MESSAGE' as const,
      httpStatus: 0,
    });
  }
  if (typeof chainId !== 'number' || !Number.isInteger(chainId)) {
    throw Object.assign(new Error('Malformed SIWE challenge: invalid chain id.'), {
      kind: 'INVALID_MESSAGE' as const,
      httpStatus: 0,
    });
  }

  return {
    message,
    nonce,
    address,
    chainId,
    domain: typeof domain === 'string' ? domain : '',
    uri: typeof uri === 'string' ? uri : '',
    issuedAt: typeof issuedAt === 'string' ? issuedAt : new Date(0).toISOString(),
    expirationTime:
      typeof expirationTime === 'string' ? expirationTime : new Date(0).toISOString(),
    version: SIWE_VERSION,
  };
}

function normalizeVerifyResponse(raw: Record<string, unknown>): {
  token: string;
  expiresAt: string;
  address: string;
  chainId: number;
} {
  if (typeof raw?.token !== 'string' || !raw.token) {
    throw Object.assign(new Error('Malformed SIWE verify response: missing token.'), {
      kind: 'UNAUTHORIZED' as const,
      httpStatus: 0,
    });
  }
  return {
    token: raw.token,
    expiresAt: typeof raw.expiresAt === 'string' ? raw.expiresAt : new Date(0).toISOString(),
    address: typeof raw.address === 'string' ? raw.address : '',
    chainId: typeof raw.chainId === 'number' ? raw.chainId : 0,
  };
}
