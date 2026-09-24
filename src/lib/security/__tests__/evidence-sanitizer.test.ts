/**
 * V2-FE-075 — Unit tests for the untrusted evidence content sanitizer.
 *
 * Covers XSS payloads, URL-scheme smuggling, bidi/control-character attacks,
 * markdown/media rendering attacks, and fail-closed behaviour.
 */
import {
  safeUrl,
  safeImageUrl,
  ipfsToHttp,
  sanitizeText,
  sanitizeEvidenceItem,
  sanitizeEvidenceList,
  isHardenedRel,
  SAFE_EXTERNAL_REL,
  SAFE_URL_SCHEMES,
} from '@/lib/security/evidence-sanitizer';

describe('safeUrl — scheme allowlist (fail closed)', () => {
  it('accepts plain https URLs', () => {
    const result = safeUrl('https://example.com/evidence');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.href).toBe('https://example.com/evidence');
  });

  it('accepts ipfs URIs', () => {
    const result = safeUrl('ipfs://QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o');
    expect(result.ok).toBe(true);
  });

  it('rejects empty, whitespace-only, and non-string values', () => {
    expect(safeUrl('').ok).toBe(false);
    expect(safeUrl('   ').ok).toBe(false);
    expect(safeUrl(null).ok).toBe(false);
    expect(safeUrl(undefined).ok).toBe(false);
    expect(safeUrl(123).ok).toBe(false);
    expect(safeUrl({}).ok).toBe(false);
  });

  it('rejects javascript: URLs including obfuscation attempts', () => {
    const vectors = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'javascript\u0009:alert(1)',
      'java\u0000script:alert(1)',
      '\u0001javascript:alert(1)',
      '  javascript:alert(1)',
      'jav&#x09;ascript:alert(1)',
    ];
    for (const vector of vectors) {
      const result = safeUrl(vector);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('unsafe_scheme');
    }
  });

  it('rejects data: and vbscript: URLs', () => {
    expect(safeUrl('data:text/html;base64,PHNjcmlwdD4=').ok).toBe(false);
    expect(safeUrl('data:image/svg+xml,<svg onload=alert(1)>').ok).toBe(false);
    expect(safeUrl('vbscript:msgbox(1)').ok).toBe(false);
  });

  it('rejects file:, blob:, about:, and filesystem: schemes', () => {
    expect(safeUrl('file:///etc/passwd').ok).toBe(false);
    expect(safeUrl('blob:https://example.com/uuid').ok).toBe(false);
    expect(safeUrl('about:blank').ok).toBe(false);
    expect(safeUrl('filesystem:https://example.com/temporary/x').ok).toBe(false);
  });

  it('rejects unknown but plausible schemes (no allowlist bypass)', () => {
    for (const vector of [
      'ftp://example.com/file',
      'http://example.com', // plaintext http is not allowlisted
      'chrome://settings',
      'intent://example.com#Intent;end',
      'market://details?id=com.example',
      'whatsapp://send?text=hi',
    ]) {
      const result = safeUrl(vector);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('disallowed_scheme');
    }
  });

  it('rejects values that fail URL parsing after cleaning', () => {
    expect(safeUrl('https://').ok).toBe(false);
    expect(safeUrl('not a url at all').ok).toBe(false);
  });

  it('rejects oversized URLs', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(3000);
    const result = safeUrl(longUrl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too_long');
  });

  it('rejects https URLs with spaces embedded in the hostname', () => {
    const result = safeUrl('https://exa mple.com/x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsafe_hostname');
  });

  it('rejects bare relative paths (no scheme)', () => {
    // Relative paths are reserved for trusted app navigation, not evidence.
    expect(safeUrl('/evidence/img1.png').ok).toBe(false);
    expect(safeUrl('./relative').ok).toBe(false);
  });

  it('strips control characters before evaluating, but only via allowlist', () => {
    // The embedded newline must not trick the parser into treating the
    // payload as two different things; the cleaned string still fails.
    const result = safeUrl('ht\ntps://example.com');
    expect(result.ok).toBe(false);
  });

  it('keeps unicode hosts that parse correctly (IDN)', () => {
    const result = safeUrl('https://例え.jp/ページ');
    expect(result.ok).toBe(true);
  });

  it('exposes the canonical scheme list', () => {
    expect([...SAFE_URL_SCHEMES]).toEqual(['https:', 'ipfs:']);
  });
});

describe('ipfsToHttp', () => {
  it('converts ipfs:// URIs to gateway URLs', () => {
    expect(ipfsToHttp('ipfs://bafybeicid')).toBe('https://ipfs.io/ipfs/bafybeicid');
  });

  it('supports paths on the CID', () => {
    expect(ipfsToHttp('ipfs://QmXxx/file.png')).toBe('https://ipfs.io/ipfs/QmXxx/file.png');
  });

  it('accepts the ipfs://ipfs/ prefixed form', () => {
    expect(ipfsToHttp('ipfs://ipfs/QmXxx')).toBe('https://ipfs.io/ipfs/QmXxx');
  });

  it('supports a custom gateway', () => {
    expect(ipfsToHttp('ipfs://QmXxx', 'https://gateway.pinata.cloud')).toBe(
      'https://gateway.pinata.cloud/ipfs/QmXxx',
    );
  });

  it('returns null for invalid values (fail closed)', () => {
    expect(ipfsToHttp('ipfs://')).toBeNull();
    expect(ipfsToHttp('https://not-ipfs.example')).toBeNull();
    expect(ipfsToHttp('ipfs://bad cid with spaces')).toBeNull();
    expect(ipfsToHttp('')).toBeNull();
    expect(ipfsToHttp(null as unknown as string)).toBeNull();
  });
});

describe('safeImageUrl — media rendering', () => {
  it('accepts https image URLs', () => {
    const result = safeImageUrl('https://cdn.example.com/evidence.png');
    expect(result.ok).toBe(true);
  });

  it('rewrites valid ipfs: image URIs to the HTTPS gateway', () => {
    const result = safeImageUrl('ipfs://QmImage123/photo.png');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.href).toBe('https://ipfs.io/ipfs/QmImage123/photo.png');
  });

  it('rejects data: URIs even though browsers render them', () => {
    // A classic XSS / exfiltration vector when used in <img src>.
    expect(safeImageUrl('data:image/png;base64,iVBORw0KGgo=').ok).toBe(false);
    expect(safeImageUrl('data:image/svg+xml,<svg onload=alert(1)>').ok).toBe(false);
  });

  it('rejects blob:, javascript:, file:, and http: sources', () => {
    expect(safeImageUrl('blob:https://example.com/x').ok).toBe(false);
    expect(safeImageUrl('javascript:alert(1)').ok).toBe(false);
    expect(safeImageUrl('file:///evidence/local.png').ok).toBe(false);
    expect(safeImageUrl('http://insecure.example/img.png').ok).toBe(false);
  });

  it('rejects malformed ipfs URIs rather than guessing a gateway URL', () => {
    const result = safeImageUrl('ipfs://not a valid cid!');
    expect(result.ok).toBe(false);
  });

  it('rejects relative paths that would hit the app origin', () => {
    expect(safeImageUrl('/evidence/img1.png').ok).toBe(false);
  });
});

describe('sanitizeText', () => {
  it('passes through ordinary text unchanged', () => {
    expect(sanitizeText('Witness testimony text')).toBe('Witness testimony text');
  });

  it('strips control characters', () => {
    expect(sanitizeText('safe\u0007bell\u001b[31mred')).toBe('safebell[31mred');
  });

  it('preserves newlines and tabs (formatting, not control injection)', () => {
    expect(sanitizeText('line one\nline two\ttabbed')).toBe('line one\nline two\ttabbed');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
    expect(sanitizeText(42)).toBe('');
    expect(sanitizeText({ x: 1 })).toBe('');
  });

  it('truncates overlong content', () => {
    expect(sanitizeText('a'.repeat(20001)).length).toBe(10000);
    expect(sanitizeText('a'.repeat(50), 10)).toBe('a'.repeat(10));
  });

  it('neutralizes HTML payloads by NOT being HTML (text remains inert)', () => {
    // The sanitizer's contract: output is only ever safe as a React text
    // child. These payloads must survive as literal text so that a developer
    // who renders them via dangerouslySetInnerHTML fails the regression test,
    // not the user.
    const payload = '<script>alert(1)</script>';
    expect(sanitizeText(payload)).toBe(payload);
    const payload2 = '<img src=x onerror=alert(1)>';
    expect(sanitizeText(payload2)).toBe(payload2);
  });
});

describe('sanitizeEvidenceItem — per-type behaviour', () => {
  it('sanitizes a valid link item with hardened rel', () => {
    const result = sanitizeEvidenceItem({ type: 'link', value: 'https://example.com/src' });
    expect(result).toMatchObject({
      kind: 'link',
      href: 'https://example.com/src',
      rel: SAFE_EXTERNAL_REL,
      text: 'https://example.com/src',
    });
    expect(isHardenedRel(result.kind === 'link' ? result.rel : null)).toBe(true);
  });

  it('blocks link items with unsafe schemes', () => {
    const result = sanitizeEvidenceItem({ type: 'link', value: 'javascript:alert(1)' });
    expect(result.kind).toBe('blocked');
  });

  it('sanitizes image items through the gateway for ipfs', () => {
    const result = sanitizeEvidenceItem({ type: 'image', value: 'ipfs://QmImg/pic.png' });
    expect(result).toMatchObject({
      kind: 'image',
      src: 'https://ipfs.io/ipfs/QmImg/pic.png',
    });
  });

  it('blocks image items with data: URIs', () => {
    const result = sanitizeEvidenceItem({ type: 'image', value: 'data:text/html,<script>' });
    expect(result.kind).toBe('blocked');
  });

  it('keeps text items as text', () => {
    const result = sanitizeEvidenceItem({ type: 'text', value: 'Witness testimony text' });
    expect(result).toMatchObject({ kind: 'text', text: 'Witness testimony text' });
  });

  it('blocks empty text items', () => {
    const result = sanitizeEvidenceItem({ type: 'text', value: '' });
    expect(result.kind).toBe('blocked');
  });

  it('treats document and video types as links', () => {
    expect(sanitizeEvidenceItem({ type: 'document', value: 'https://example.com/doc.pdf' }).kind).toBe('link');
    expect(sanitizeEvidenceItem({ type: 'video', value: 'https://example.com/v.mp4' }).kind).toBe('link');
  });

  it('blocks unsupported types', () => {
    const result = sanitizeEvidenceItem({ type: 'iframe', value: 'https://example.com' });
    expect(result.kind).toBe('blocked');
  });

  it('blocks null/undefined/malformed items without throwing', () => {
    expect(sanitizeEvidenceItem(null).kind).toBe('blocked');
    expect(sanitizeEvidenceItem(undefined).kind).toBe('blocked');
    expect(sanitizeEvidenceItem({ type: 42 as unknown as string, value: 'x' }).kind).toBe('blocked');
    expect(sanitizeEvidenceItem({ type: 'link' } as never).kind).toBe('blocked');
  });

  it('normalizes type casing', () => {
    expect(sanitizeEvidenceItem({ type: 'LINK', value: 'https://example.com' }).kind).toBe('link');
    expect(sanitizeEvidenceItem({ type: 'Image', value: 'https://example.com/i.png' }).kind).toBe('image');
  });

  it('blocked items carry a safe preview of the blocked value', () => {
    const result = sanitizeEvidenceItem({
      type: 'link',
      value: 'javascript:alert("payload")',
    });
    if (result.kind === 'blocked') {
      expect(result.preview).toContain('javascript:alert("payload")');
      expect(result.reason).toMatch(/blocked/i);
    } else {
      throw new Error('expected blocked item');
    }
  });
});

describe('sanitizeEvidenceList', () => {
  it('returns empty array for null/undefined input', () => {
    expect(sanitizeEvidenceList(null)).toEqual([]);
    expect(sanitizeEvidenceList(undefined)).toEqual([]);
  });

  it('maps every item and keeps blocked placeholders in order', () => {
    const items = [
      { type: 'link', value: 'https://ok.example' },
      { type: 'link', value: 'javascript:alert(1)' },
      { type: 'text', value: 'plain' },
    ];
    const result = sanitizeEvidenceList(items);
    expect(result).toHaveLength(3);
    expect(result[0].kind).toBe('link');
    expect(result[1].kind).toBe('blocked');
    expect(result[2].kind).toBe('text');
  });

  it('never throws on garbage input', () => {
    expect(() =>
      sanitizeEvidenceList([null, undefined, { type: 'link' } as never, 'string' as never, 42 as never]),
    ).not.toThrow();
  });
});

describe('markdown / rich-text rendering attacks', () => {
  it('markdown link syntax with a javascript: href is blocked as a link value', () => {
    // If the payload is pasted into a link-type evidence value, the scheme
    // check must reject it; the markdown syntax itself is never interpreted.
    const result = sanitizeEvidenceItem({
      type: 'link',
      value: 'javascript:alert(1) "[x](https://evil.example)"',
    });
    expect(result.kind).toBe('blocked');
  });

  it('markdown/HTML in text-type evidence stays inert text', () => {
    const result = sanitizeEvidenceItem({
      type: 'text',
      value: '[click](javascript:alert(1)) <img src=x onerror=alert(1)>',
    });
    expect(result.kind).toBe('text');
    if (result.kind === 'text') {
      expect(result.text).toBe('[click](javascript:alert(1)) <img src=x onerror=alert(1)>');
    }
  });

  it('svg onload payloads in link values are rejected by scheme check', () => {
    const result = sanitizeEvidenceItem({
      type: 'link',
      value: 'data:image/svg+xml,<svg onload=alert(1)>',
    });
    expect(result.kind).toBe('blocked');
  });

  it('event-handler attributes inside https URLs do not bypass validation', () => {
    // Only the scheme/host matter; the URL is never decoded into HTML.
    const result = sanitizeEvidenceItem({
      type: 'link',
      value: 'https://example.com/?q=<img src=x onerror=alert(1)>',
    });
    expect(result.kind).toBe('link');
  });
});

describe('rel hardening helpers', () => {
  it('SAFE_EXTERNAL_REL contains noopener and noreferrer', () => {
    expect(isHardenedRel(SAFE_EXTERNAL_REL)).toBe(true);
    expect(SAFE_EXTERNAL_REL).toContain('noopener');
    expect(SAFE_EXTERNAL_REL).toContain('noreferrer');
  });

  it('isHardenedRel rejects weak rel values', () => {
    expect(isHardenedRel(undefined)).toBe(false);
    expect(isHardenedRel(null)).toBe(false);
    expect(isHardenedRel('')).toBe(false);
    expect(isHardenedRel('nofollow')).toBe(false);
    expect(isHardenedRel('external')).toBe(false);
    expect(isHardenedRel('noopener')).toBe(false);
    expect(isHardenedRel('noreferrer')).toBe(false);
  });

  it('isHardenedRel accepts hardened values in any order and case', () => {
    expect(isHardenedRel('noreferrer noopener')).toBe(true);
    expect(isHardenedRel('NOOPENER NOREFERRER')).toBe(true);
    expect(isHardenedRel('noopener noreferrer nofollow ugc')).toBe(true);
  });
});
