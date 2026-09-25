import {
  addressesEqual,
  classifySiweHttpError,
  createSiweApiClient,
  isChallengeFresh,
  parseSiweMessage,
  validateChallenge,
  validateChallengeAgainstWallet,
} from '../siwe-client';

const ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1E';
const MESSAGE = `truthbounty.app wants you to sign in with your Ethereum account:
${ADDRESS}

Sign in to TruthBounty.

URI: https://truthbounty.app
Version: 1
Chain ID: 10
Nonce: abc123XYZ
Issued At: 2026-08-31T00:00:00.000Z
Expiration Time: 2026-09-01T00:00:00.000Z`;

function makeChallenge(overrides: Record<string, unknown> = {}) {
  return {
    message: MESSAGE,
    nonce: 'abc123XYZ',
    address: ADDRESS.toLowerCase(),
    chainId: 10,
    issuedAt: '2026-08-31T00:00:00.000Z',
    expirationTime: '2026-09-01T00:00:00.000Z',
    domain: 'truthbounty.app',
    uri: 'https://truthbounty.app',
    version: '1',
    ...overrides,
  };
}

describe('parseSiweMessage', () => {
  it('extracts the standard EIP-4361 fields', () => {
    const parsed = parseSiweMessage(MESSAGE);
    expect(parsed).not.toBeNull();
    expect(parsed?.domain).toBe('truthbounty.app');
    expect(parsed?.address).toBe(ADDRESS.toLowerCase());
    expect(parsed?.chainId).toBe(10);
    expect(parsed?.nonce).toBe('abc123XYZ');
    expect(parsed?.issuedAt).toBe('2026-08-31T00:00:00.000Z');
    expect(parsed?.expirationTime).toBe('2026-09-01T00:00:00.000Z');
    expect(parsed?.version).toBe('1');
  });

  it('returns null for an empty or non-string message', () => {
    expect(parseSiweMessage('')).toBeNull();
    expect(parseSiweMessage('not a siwe message')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    const missingNonce = MESSAGE.replace(/^Nonce:.*$/m, '');
    expect(parseSiweMessage(missingNonce)).toBeNull();
  });

  it('returns null when the header is malformed', () => {
    const bad = MESSAGE.replace('wants you to sign in with your Ethereum account:', '');
    expect(parseSiweMessage(bad)).toBeNull();
  });
});

describe('addressesEqual', () => {
  it('compares addresses case-insensitively', () => {
    expect(addressesEqual(ADDRESS, ADDRESS.toLowerCase())).toBe(true);
    expect(addressesEqual(ADDRESS, '0x000000000000000000000000000000000000dead')).toBe(false);
    expect(addressesEqual(ADDRESS, null)).toBe(false);
    expect(addressesEqual(undefined, undefined)).toBe(false);
  });
});

describe('isChallengeFresh', () => {
  it('marks an expired challenge as NONCE_EXPIRED', () => {
    const r = isChallengeFresh({ expirationTime: '2026-01-01T00:00:00.000Z' }, Date.parse('2026-08-31T00:00:00.000Z'));
    expect(r.kind).toBe('NONCE_EXPIRED');
    expect(r.expired).toBe(true);
  });

  it('treats a challenge whose expiration is in the future as fresh', () => {
    const r = isChallengeFresh({ expirationTime: '2026-09-01T00:00:00.000Z' }, Date.parse('2026-08-31T00:00:00.000Z'));
    expect(r.kind).toBeNull();
    expect(r.expired).toBe(false);
  });

  it('treats a missing expiration as fresh (backend authority)', () => {
    const r = isChallengeFresh({ expirationTime: '' }, Date.parse('2026-08-31T00:00:00.000Z'));
    expect(r.kind).toBeNull();
    expect(r.expired).toBe(false);
  });
});

describe('validateChallengeAgainstWallet', () => {
  const challenge = {
    address: ADDRESS.toLowerCase(),
    chainId: 10,
    nonce: 'n1',
    issuedAt: '',
    expirationTime: '',
    domain: 'truthbounty.app',
    uri: 'https://truthbounty.app',
    version: '1',
  };

  it('returns null when account and chain match', () => {
    expect(validateChallengeAgainstWallet(challenge, { address: ADDRESS, chainId: 10 })).toBeNull();
  });

  it('returns WRONG_ACCOUNT on a mismatched signer', () => {
    const f = validateChallengeAgainstWallet(challenge, {
      address: '0x000000000000000000000000000000000000dead',
      chainId: 10,
    });
    expect(f?.kind).toBe('WRONG_ACCOUNT');
  });

  it('returns WRONG_CHAIN on a mismatched chain', () => {
    const f = validateChallengeAgainstWallet(challenge, { address: ADDRESS, chainId: 1 });
    expect(f?.kind).toBe('WRONG_CHAIN');
  });
});

describe('validateChallenge', () => {
  it('returns no failure for a valid fresh challenge', () => {
    const { failure } = validateChallenge(makeChallenge(), {
      address: ADDRESS,
      chainId: 10,
      now: Date.parse('2026-08-31T12:00:00.000Z'),
    });
    expect(failure).toBeNull();
  });

  it('flags a stale (expired) challenge', () => {
    const { failure } = validateChallenge(makeChallenge(), {
      address: ADDRESS,
      chainId: 10,
      now: Date.parse('2026-09-02T00:00:00.000Z'),
    });
    expect(failure?.kind).toBe('NONCE_EXPIRED');
  });

  it('flags a wrong account', () => {
    const { failure } = validateChallenge(makeChallenge(), {
      address: '0x000000000000000000000000000000000000dead',
      chainId: 10,
      now: Date.parse('2026-08-31T12:00:00.000Z'),
    });
    expect(failure?.kind).toBe('WRONG_ACCOUNT');
  });

  it('flags a wrong chain', () => {
    const { failure } = validateChallenge(makeChallenge(), {
      address: ADDRESS,
      chainId: 1,
      now: Date.parse('2026-08-31T12:00:00.000Z'),
    });
    expect(failure?.kind).toBe('WRONG_CHAIN');
  });

  it('flags a malformed message', () => {
    const { failure } = validateChallenge(makeChallenge({ message: 'garbage' }), {
      address: ADDRESS,
      chainId: 10,
      now: Date.parse('2026-08-31T12:00:00.000Z'),
    });
    expect(failure?.kind).toBe('INVALID_MESSAGE');
  });
});

describe('classifySiweHttpError', () => {
  it('classifies replay responses (409/410)', () => {
    expect(classifySiweHttpError(409, { code: 'replay' }).kind).toBe('REPLAYED');
    expect(classifySiweHttpError(410, { message: 'nonce reused' }).kind).toBe('REPLAYED');
  });

  it('classifies explicit nonce-expired responses', () => {
    expect(classifySiweHttpError(401, { code: 'nonce_expired' }).kind).toBe('NONCE_EXPIRED');
    expect(classifySiweHttpError(400, { code: 'stale_nonce' }).kind).toBe('NONCE_EXPIRED');
  });

  it('classifies generic unauthorized responses', () => {
    expect(classifySiweHttpError(401, { message: 'bad signature' }).kind).toBe('UNAUTHORIZED');
  });

  it('classifies replay marker on 400', () => {
    expect(classifySiweHttpError(400, { code: 'replayed' }).kind).toBe('REPLAYED');
  });

  it('falls back to NETWORK for unclassified statuses', () => {
    expect(classifySiweHttpError(500, {}).kind).toBe('NETWORK');
  });

  // --- edge cases: null / undefined / unexpected body types ---

  it('handles undefined body gracefully and falls back to generic message', () => {
    const result = classifySiweHttpError(500);
    expect(result.kind).toBe('NETWORK');
    expect(result.message).toBe('SIWE request failed with HTTP 500.');
    expect(result.code).toBeUndefined();
  });

  it('handles null body without crashing', () => {
    const result = classifySiweHttpError(401, null);
    expect(result.kind).toBe('UNAUTHORIZED');
    expect(result.message).toBe('SIWE request failed with HTTP 401.');
  });

  it('handles a primitive string body without crashing', () => {
    const result = classifySiweHttpError(400, 'some error string');
    expect(result.kind).toBe('INVALID_MESSAGE');
    expect(result.code).toBeUndefined();
  });

  it('handles a numeric body without crashing', () => {
    const result = classifySiweHttpError(500, 42);
    expect(result.kind).toBe('NETWORK');
    expect(result.code).toBeUndefined();
  });

  it('handles an array body without crashing', () => {
    const result = classifySiweHttpError(500, ['err']);
    expect(result.kind).toBe('NETWORK');
    expect(result.code).toBeUndefined();
  });

  // --- message extraction paths ---

  it('uses body.message when present', () => {
    const result = classifySiweHttpError(500, { message: 'something went wrong' });
    expect(result.message).toBe('something went wrong');
  });

  it('uses body.error string as message when body.message is absent', () => {
    const result = classifySiweHttpError(500, { error: 'flat error string' });
    expect(result.message).toBe('flat error string');
  });

  it('uses nested body.error.message when present', () => {
    const result = classifySiweHttpError(500, { error: { message: 'nested message' } });
    expect(result.message).toBe('nested message');
  });

  it('falls back to generic message when body has no recognizable message field', () => {
    const result = classifySiweHttpError(403, { unrelated: true });
    expect(result.message).toBe('SIWE request failed with HTTP 403.');
  });

  // --- code extraction paths ---

  it('extracts code from body.code', () => {
    const result = classifySiweHttpError(500, { code: 'some_code' });
    expect(result.code).toBe('some_code');
  });

  it('extracts code from body.error string', () => {
    const result = classifySiweHttpError(500, { error: 'error_code' });
    expect(result.code).toBe('error_code');
  });

  it('extracts code from nested body.error.code', () => {
    const result = classifySiweHttpError(500, { error: { code: 'nested_code' } });
    expect(result.code).toBe('nested_code');
  });

  // --- isExpiredCode patterns on 401 ---

  it('classifies 401 with "expired" in the code as NONCE_EXPIRED', () => {
    expect(classifySiweHttpError(401, { code: 'token_expired' }).kind).toBe('NONCE_EXPIRED');
    expect(classifySiweHttpError(401, { code: 'session_timeout' }).kind).toBe('NONCE_EXPIRED');
    expect(classifySiweHttpError(401, { code: 'stale_session' }).kind).toBe('NONCE_EXPIRED');
  });

  // --- 400 fallthrough to INVALID_MESSAGE ---

  it('classifies 400 with no recognizable code as INVALID_MESSAGE', () => {
    expect(classifySiweHttpError(400, { message: 'bad input' }).kind).toBe('INVALID_MESSAGE');
    expect(classifySiweHttpError(400, {}).kind).toBe('INVALID_MESSAGE');
  });

  // --- other HTTP statuses → NETWORK ---

  it('classifies 2xx non-ok statuses and other 4xx/5xx as NETWORK', () => {
    expect(classifySiweHttpError(403, {}).kind).toBe('NETWORK');
    expect(classifySiweHttpError(404, {}).kind).toBe('NETWORK');
    expect(classifySiweHttpError(503, {}).kind).toBe('NETWORK');
  });
});

describe('createSiweApiClient', () => {
  function mockResponse(body: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      async json() {
        return body;
      },
    } as Response;
  }

  it('requests a challenge and normalizes it', async () => {
    const fetchMock = jest.fn().mockResolvedValue(mockResponse({
      message: MESSAGE,
      nonce: 'abc123XYZ',
      address: ADDRESS.toLowerCase(),
      chainId: 10,
      domain: 'truthbounty.app',
      uri: 'https://truthbounty.app',
      issuedAt: '2026-08-31T00:00:00.000Z',
      expirationTime: '2026-09-01T00:00:00.000Z',
    }));
    const client = createSiweApiClient('https://api.example.com', fetchMock as unknown as typeof fetch);

    const challenge = await client.requestChallenge({ address: ADDRESS, chainId: 10 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/auth/siwe/challenge',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(challenge.message).toBe(MESSAGE);
    expect(challenge.chainId).toBe(10);
  });

  it('throws INVALID_MESSAGE for a malformed challenge payload', async () => {
    const fetchMock = jest.fn().mockResolvedValue(mockResponse({ message: '', nonce: 'x' }));
    const client = createSiweApiClient('https://api.example.com', fetchMock as unknown as typeof fetch);
    await expect(client.requestChallenge({ address: ADDRESS, chainId: 10 })).rejects.toMatchObject({
      kind: 'INVALID_MESSAGE',
    });
  });

  it('propagates REPLAYED for a 409 on verification', async () => {
    const fetchMock = jest.fn().mockResolvedValue(mockResponse({ code: 'replay' }, 409));
    const client = createSiweApiClient('https://api.example.com', fetchMock as unknown as typeof fetch);
    await expect(
      client.submitVerification({ message: MESSAGE, signature: '0xabcdef', address: ADDRESS.toLowerCase(), chainId: 10 }),
    ).rejects.toMatchObject({ kind: 'REPLAYED' });
  });

  it('throws NETWORK on a transport failure', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const client = createSiweApiClient('https://api.example.com', fetchMock as unknown as typeof fetch);
    await expect(client.requestChallenge({ address: ADDRESS, chainId: 10 })).rejects.toMatchObject({
      kind: 'NETWORK',
    });
  });
});
