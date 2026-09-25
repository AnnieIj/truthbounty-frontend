import {
  NONCE_HEADER,
  SECURITY_HEADER_NAMES,
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  buildStaticSecurityHeaders,
  createRequestNonce,
} from '@/lib/security/headers';

describe('V2-FE-131 security headers', () => {
  const nonce = 'test-nonce-abc123';

  describe('buildContentSecurityPolicy', () => {
    it('requires a nonce (fail closed)', () => {
      expect(() => buildContentSecurityPolicy({ nonce: '' })).toThrow(/nonce/i);
    });

    it('emits enforcing CSP with nonce, strict-dynamic, and deny framing', () => {
      const csp = buildContentSecurityPolicy({ nonce });
      expect(csp).toContain(`'nonce-${nonce}'`);
      expect(csp).toContain("'strict-dynamic'");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain('upgrade-insecure-requests');
      expect(csp).toContain('https://*.walletconnect.com');
      expect(csp).toContain('https://id.worldcoin.org');
      expect(csp).not.toContain("'unsafe-eval'");
    });

    it('allows unsafe-eval only in development for Next HMR', () => {
      const csp = buildContentSecurityPolicy({ nonce, isDevelopment: true });
      expect(csp).toContain("'unsafe-eval'");
      expect(csp).toContain('http://localhost:*');
    });
  });

  describe('buildSecurityHeaders', () => {
    it('sets CSP plus baseline browser hardening headers', () => {
      const headers = buildSecurityHeaders({ nonce });
      expect(headers[SECURITY_HEADER_NAMES.contentSecurityPolicy]).toContain(
        `'nonce-${nonce}'`,
      );
      expect(headers[SECURITY_HEADER_NAMES.contentSecurityPolicyReportOnly]).toBeUndefined();
      expect(headers[SECURITY_HEADER_NAMES.strictTransportSecurity]).toContain('max-age=');
      expect(headers[SECURITY_HEADER_NAMES.xContentTypeOptions]).toBe('nosniff');
      expect(headers[SECURITY_HEADER_NAMES.xFrameOptions]).toBe('DENY');
      expect(headers[SECURITY_HEADER_NAMES.referrerPolicy]).toBe(
        'strict-origin-when-cross-origin',
      );
      expect(headers[SECURITY_HEADER_NAMES.crossOriginOpenerPolicy]).toBe(
        'same-origin-allow-popups',
      );
      expect(headers[SECURITY_HEADER_NAMES.permissionsPolicy]).toContain('camera=');
      expect(headers[SECURITY_HEADER_NAMES.permissionsPolicy]).toContain('microphone=()');
    });

    it('can emit report-only CSP for staged rollout', () => {
      const headers = buildSecurityHeaders({ nonce, reportOnly: true });
      expect(headers[SECURITY_HEADER_NAMES.contentSecurityPolicy]).toBeUndefined();
      expect(headers[SECURITY_HEADER_NAMES.contentSecurityPolicyReportOnly]).toContain(
        `'nonce-${nonce}'`,
      );
    });
  });

  describe('buildStaticSecurityHeaders', () => {
    it('omits CSP (nonce-bound) but keeps static hardening headers', () => {
      const headers = buildStaticSecurityHeaders();
      expect(headers[SECURITY_HEADER_NAMES.contentSecurityPolicy]).toBeUndefined();
      expect(headers[SECURITY_HEADER_NAMES.xContentTypeOptions]).toBe('nosniff');
      expect(headers[SECURITY_HEADER_NAMES.xFrameOptions]).toBe('DENY');
    });
  });

  describe('createRequestNonce / NONCE_HEADER', () => {
    it('produces a non-empty nonce suitable for CSP', () => {
      const a = createRequestNonce();
      const b = createRequestNonce();
      expect(a.length).toBeGreaterThan(8);
      expect(b.length).toBeGreaterThan(8);
      expect(a).not.toEqual(b);
      expect(NONCE_HEADER).toBe('x-nonce');
    });
  });
});
