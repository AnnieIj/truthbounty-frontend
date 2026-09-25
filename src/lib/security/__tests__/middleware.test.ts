/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { middleware, _testing } from '../../middleware';
import { CSP_NONCE_HEADER } from '../csp-allowlist';

const url = 'https://truthbounty.example.com/';

function makeRequest(headersInit: Record<string, string> = {}): NextRequest {
  return new NextRequest(new Request(url, { headers: headersInit }));
}

describe('middleware headers', () => {
  it('sets CSP, nosniff, referrer-policy, permissions-policy, x-frame-options', () => {
    const resp = middleware(makeRequest());
    expect(resp.headers.get('content-security-policy')).toBeTruthy();
    expect(resp.headers.get('x-content-type-options')).toBe('nosniff');
    expect(resp.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(resp.headers.get('permissions-policy')).toContain('camera=()');
    expect(resp.headers.get('permissions-policy')).toContain('microphone=()');
    expect(resp.headers.get('x-frame-options')).toBe('DENY');
  });

  it('mirrors nonce in the CSP header AND the downstream nonce header', () => {
    const resp = middleware(makeRequest());
    const nonce = resp.headers.get(CSP_NONCE_HEADER);
    expect(nonce).toBeTruthy();
    expect((resp.headers.get('content-security-policy') as string)).toContain(
      `'nonce-${nonce}'`,
    );
  });

  it('CSP never contains unsafe-inline for script-src in production', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const resp = middleware(makeRequest());
      const csp = resp.headers.get('content-security-policy') as string;
      expect(csp).not.toMatch(/script-src [^;]*unsafe-inline/);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});

describe('_testing.generateNonce', () => {
  it('produces 128-bit URL-safe base64, 21-22 chars, no collisions in 10k', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      const n = _testing.generateNonce();
      expect(n.length).toBeGreaterThanOrEqual(21);
      expect(n.length).toBeLessThanOrEqual(22);
      expect(n).toMatch(/^[A-Za-z0-9\-_]+$/);
      expect(seen.has(n)).toBe(false);
      seen.add(n);
    }
    expect(seen.size).toBe(10000);
  });
});
