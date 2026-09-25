import {
  REDACTED,
  redactForTelemetry,
  redactError,
  redactForErrorReporter,
} from '@/lib/security/redaction';

describe('REDACTED constant', () => {
  it('is the exact string [REDACTED]', () => {
    expect(REDACTED).toBe('[REDACTED]');
  });
});

describe('redactForTelemetry — sensitive key redaction', () => {
  it('redacts all sensitive keys and preserves non-sensitive fields including 66-char tx hash', () => {
    const txHash = '0x' + 'a'.repeat(64);
    const input = {
      token: 'abc',
      secret: 'x',
      authorization: 'Bearer abcdef',
      password: 'hunter2',
      privateKey: '123',
      apiKey: '456',
      cookie: 'x',
      session: 'y',
      chainId: 10,
      txHash,
      blockNumber: 123n,
      reason: 'user rejected',
    };
    const result = redactForTelemetry(input) as Record<string, unknown>;

    expect(result.token).toBe(REDACTED);
    expect(result.secret).toBe(REDACTED);
    expect(result.authorization).toBe(REDACTED);
    expect(result.password).toBe(REDACTED);
    expect(result.privateKey).toBe(REDACTED);
    expect(result.apiKey).toBe(REDACTED);
    expect(result.cookie).toBe(REDACTED);
    expect(result.session).toBe(REDACTED);

    expect(result.chainId).toBe(10);
    expect(result.txHash).toBe(txHash);
    expect(result.blockNumber).toBe(123n);
    expect(result.reason).toBe('user rejected');
  });

  it('matches sensitive keys case-insensitively with dashes and underscores', () => {
    const result = redactForTelemetry({
      'X-Auth-Token': 't1',
      'api_key': 'k2',
      'PRIVATE-KEY': 'pk3',
      'Session_Id': 's4',
      safeField: 'ok',
    }) as Record<string, unknown>;

    expect(result['X-Auth-Token']).toBe(REDACTED);
    expect(result['api_key']).toBe(REDACTED);
    expect(result['PRIVATE-KEY']).toBe(REDACTED);
    expect(result['Session_Id']).toBe(REDACTED);
    expect(result.safeField).toBe('ok');
  });
});

describe('redactForTelemetry — deep nesting and signature', () => {
  it('redacts deeply nested signature with long string value', () => {
    const longSig = '0x' + 'b'.repeat(130);
    const input = { a: { b: { signature: longSig } } };
    const result = redactForTelemetry(input) as { a: { b: { signature: unknown } } };
    expect(result.a.b.signature).toBe(REDACTED);
  });

  it('preserves short signature values (<= 10 chars)', () => {
    const result = redactForTelemetry({
      signature: 'short',
      nested: { signature: '1234567890' },
    }) as Record<string, unknown>;
    expect(result.signature).toBe('short');
    expect((result.nested as Record<string, unknown>).signature).toBe('1234567890');
  });
});

describe('redactForTelemetry — calldata / data / input long hex', () => {
  it('redacts long calldata hex (> 20 chars after 0x)', () => {
    const longCalldata = '0x' + 'c'.repeat(200);
    const result = redactForTelemetry({ calldata: longCalldata }) as Record<string, unknown>;
    expect(result.calldata).toBe(REDACTED);
  });

  it('preserves short calldata hex (<= 20 chars after 0x)', () => {
    const shortCalldata = '0x1234';
    const result = redactForTelemetry({ calldata: shortCalldata }) as Record<string, unknown>;
    expect(result.calldata).toBe('0x1234');
  });

  it('redacts long `data` and `input` hex keys as well', () => {
    const longHex = '0x' + 'c'.repeat(100);
    const result = redactForTelemetry({
      data: longHex,
      input: longHex,
    }) as Record<string, unknown>;
    expect(result.data).toBe(REDACTED);
    expect(result.input).toBe(REDACTED);
  });
});

describe('redactForTelemetry — free-string 66+ hex char patterns', () => {
  it('redacts a string value that contains a 66-char (actually longer) privkey-looking hex', () => {
    const privkey = '0x' + 'd'.repeat(64);
    const longer = '0x' + 'd'.repeat(80);
    const result = redactForTelemetry({
      payload: `use private key ${longer} done`,
    }) as Record<string, unknown>;
    expect(typeof result.payload).toBe('string');
    expect((result.payload as string).toUpperCase()).not.toContain('D'.repeat(80));
    expect(result.payload).toContain(REDACTED);
  });

  it('preserves a normal 66-char tx hash in a generic (non-sensitive) key', () => {
    const txHash = '0x' + 'e'.repeat(64);
    const result = redactForTelemetry({ foo: txHash }) as Record<string, unknown>;
    expect(result.foo).toBe(txHash);
  });

  it('still redacts 66-char tx hash when placed under a sensitive key', () => {
    const txHash = '0x' + 'e'.repeat(64);
    const result = redactForTelemetry({ token: txHash }) as Record<string, unknown>;
    expect(result.token).toBe(REDACTED);
  });

  it('redacts hex strings strictly longer than 66 chars even in generic keys', () => {
    const tooLong = '0x' + 'f'.repeat(80);
    const result = redactForTelemetry({ generic: tooLong }) as Record<string, unknown>;
    expect(result.generic).toContain(REDACTED);
  });
});

describe('redactForTelemetry — deep cloning and type handling', () => {
  it('recursively redacts arrays', () => {
    const input = [{ token: 'a' }, { safe: 'b', secret: 'c' }, ['nested', { password: 'p' }]];
    const result = redactForTelemetry(input) as unknown[];
    expect((result[0] as Record<string, unknown>).token).toBe(REDACTED);
    expect((result[1] as Record<string, unknown>).safe).toBe('b');
    expect((result[1] as Record<string, unknown>).secret).toBe(REDACTED);
    const inner = (result[2] as unknown[])[1] as Record<string, unknown>;
    expect(inner.password).toBe(REDACTED);
  });

  it('passes primitives through', () => {
    expect(redactForTelemetry(null)).toBeNull();
    expect(redactForTelemetry(undefined)).toBeUndefined();
    expect(redactForTelemetry(42)).toBe(42);
    expect(redactForTelemetry(true)).toBe(true);
    expect(redactForTelemetry(123n)).toBe(123n);
    expect(redactForTelemetry('plain text')).toBe('plain text');
  });

  it('removes functions and symbols (replaced with undefined)', () => {
    const sym = Symbol('s');
    const fn = () => 1;
    const input = { a: fn, b: sym, c: 'ok' };
    Object.defineProperty(input, sym as unknown as string, { value: 'hidden', enumerable: true });
    const result = redactForTelemetry(input) as Record<string, unknown>;
    expect(result.a).toBeUndefined();
    expect(result.b).toBeUndefined();
    expect(result.c).toBe('ok');
  });

  it('converts Date to ISO string and RegExp to REDACTED', () => {
    const d = new Date('2024-01-01T00:00:00.000Z');
    const re = /evil/i;
    const result = redactForTelemetry({ d, re }) as Record<string, unknown>;
    expect(result.d).toBe('2024-01-01T00:00:00.000Z');
    expect(result.re).toBe(REDACTED);
  });

  it('converts Map and Set to plain array form', () => {
    const m = new Map<string, unknown>([['token', 'x'], ['safe', 'y']]);
    const s = new Set<unknown>([{ password: 'p' }, 'ok']);
    const result = redactForTelemetry({ m, s }) as Record<string, unknown>;
    expect(Array.isArray(result.m)).toBe(true);
    const mArr = result.m as Array<[unknown, unknown]>;
    expect(mArr).toHaveLength(2);
    expect(mArr[0][1]).toBe(REDACTED);
    expect(mArr[1][1]).toBe('y');
    expect(Array.isArray(result.s)).toBe(true);
    const sArr = result.s as unknown[];
    expect((sArr[0] as Record<string, unknown>).password).toBe(REDACTED);
    expect(sArr[1]).toBe('ok');
  });

  it('replaces non-plain objects with REDACTED (fail closed)', () => {
    class Foo {
      secret = 'x';
    }
    const result = redactForTelemetry({ foo: new Foo() }) as Record<string, unknown>;
    expect(result.foo).toBe(REDACTED);
  });
});

describe('redactForTelemetry — prototype pollution guard', () => {
  it('does not copy inherited properties from Object.prototype', () => {
    const before = (Object.prototype as Record<string, unknown>).foo;
    try {
      (Object.prototype as Record<string, unknown>).foo = 'evil';
      const result = redactForTelemetry({ good: 'value' }) as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(result, 'foo')).toBe(false);
      expect('foo' in result).toBe(false);
      expect(result.good).toBe('value');
    } finally {
      if (before === undefined) {
        delete (Object.prototype as Record<string, unknown>).foo;
      } else {
        (Object.prototype as Record<string, unknown>).foo = before;
      }
    }
  });
});

describe('redactError — Error instance sanitization', () => {
  it('replaces long hex in message and stack, preserves exactly-66 tx hashes', () => {
    const exactly66 = '0x' + 'f'.repeat(64);
    const longer = '0x' + 'f'.repeat(80);
    const err = new Error(`fail with ${longer} sig and tx ${exactly66}`);
    err.stack = `Error: fail with ${longer} sig\n    at foo (file.ts:1:1)\n    at bar ${exactly66}`;

    const r = redactError(err);
    expect(r.name).toBe('Error');
    expect(r.message).toContain(REDACTED);
    expect(r.message).toContain(exactly66);
    expect(r.message).not.toContain('f'.repeat(80));
    expect(r.stack).not.toBeNull();
    expect(r.stack).toContain(REDACTED);
    expect(r.stack).toContain(exactly66);
  });

  it('strips Bearer tokens from message and stack', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ.0123456789-_~+/=';
    const err = new Error(`auth: Bearer ${token} done`);
    err.stack = `Error: auth\nBearer ${token}\n    at x`;
    const r = redactError(err);
    expect(r.message).not.toContain(token);
    expect(r.message).toContain(`Bearer ${REDACTED}`);
    expect(r.stack).not.toContain(token);
    expect(r.stack).toContain(`Bearer ${REDACTED}`);
  });

  it('redacts cause via redactForTelemetry', () => {
    const cause = { token: 'x', nested: { password: 'p' } };
    const err = new Error('boom', { cause });
    const r = redactError(err);
    const causeOut = r.cause as Record<string, unknown>;
    expect(causeOut.token).toBe(REDACTED);
    expect((causeOut.nested as Record<string, unknown>).password).toBe(REDACTED);
  });

  it('handles non-Error inputs gracefully', () => {
    expect(redactError('string fail')).toEqual({
      name: 'Error',
      message: 'string fail',
      stack: null,
      cause: undefined,
    });
    expect(redactError(null)).toEqual({
      name: 'Error',
      message: '',
      stack: null,
      cause: undefined,
    });
    expect(redactError(undefined)).toEqual({
      name: 'Error',
      message: '',
      stack: null,
      cause: undefined,
    });
    expect(
      redactError({ name: 'Custom', message: 'msg', stack: 'st', cause: { secret: 'x' } }),
    ).toEqual({
      name: 'Custom',
      message: 'msg',
      stack: 'st',
      cause: { secret: REDACTED },
    });
  });
});

describe('redactForErrorReporter convenience', () => {
  it('delegates to redactForTelemetry', () => {
    const out = redactForErrorReporter({ token: 'abc', keep: 1 });
    expect(out).toEqual({ token: REDACTED, keep: 1 });
  });
});
