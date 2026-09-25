/**
 * V2-FE-075 — Untrusted evidence content sanitizer.
 *
 * All claim, evidence, and API-provided content is treated as untrusted input
 * (see Security and Architecture Requirements for V2-FE-075). This module is
 * the single source of truth for:
 *
 *   1. Safe external URL validation (scheme allowlist, fail closed)
 *   2. rel/target attribute hardening for links that open in a new tab
 *   3. Safe text rendering (never innerHTML — React escaping only)
 *   4. Image URL validation for evidence media
 *
 * Design rules:
 *   - Fail closed: unknown/invalid/unparseable content is rejected, not guessed.
 *   - No DOM parsing, no eval, no dynamic HTML construction — the ONLY sanctioned
 *     rich-text output in this codebase is React's text escaping, so a `markdown`
 *     renderer (marked/remark/etc.) would reintroduce an XSS vector. If rich
 *     rendering is ever required, it must go through DOMPurify or equivalent and
 *     extend the regression guard in `src/__tests__/regression/evidence-rendering.test.ts`.
 *   - Wagmi/Viem and canonical Optimism/EVM receipts remain authoritative for
 *     protocol mutations; this module has zero protocol-surface knowledge.
 */

// ---------------------------------------------------------------------------
// URL scheme allowlist (fail closed)
// ---------------------------------------------------------------------------

/**
 * Schemes an evidence/claim URL may use. Anything else — including
 * `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, and unknown
 * app-registered schemes — is rejected.
 *
 * `ipfs:` is allowlisted because canonical evidence is content-addressed on
 * IPFS; use `safeIpfsHttpUrl` when an HTTP gateway URL is actually needed.
 */
export const SAFE_URL_SCHEMES = ['https:', 'ipfs:'] as const;

/** Schemes that are dangerous when placed in an `href`. */
const UNSAFE_SCHEMES = [
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'blob:',
  'about:',
  'filesystem:',
] as const;

/** Relative in-app paths (used by trusted UI chrome, not external evidence). */
const APP_SCHEME = 'app:';

export type SafeUrlKind = 'external' | 'app';

export interface SafeUrlResult {
  ok: true;
  /** The sanitized URL, safe to place in `href` or `src`. */
  href: string;
  kind: SafeUrlKind;
  /** Parsed URL for callers that need hostname/etc. Only for `kind: 'external'`. */
  url: URL;
}

export type UnsafeUrlResult = {
  ok: false;
  /** Machine-readable reason the URL was rejected (for tests and logging). */
  reason:
    | 'empty'
    | 'too_long'
    | 'unparseable'
    | 'unsafe_scheme'
    | 'disallowed_scheme'
    | 'unsafe_hostname';
  /** Human-readable explanation safe to render. */
  message: string;
};

export type SafeUrlCheck = SafeUrlResult | UnsafeUrlResult;

const MAX_URL_LENGTH = 2048;

/**
 * Validate a URL from an untrusted source against the allowlist.
 *
 * - Only `https:` and `ipfs:` (plus explicit internal `app:` paths) pass.
 * - URL-embedded whitespace/control characters and unicode-directional
 *   overrides are stripped before parsing so `java\nscript:` cannot smuggle
 *   through; the remaining string must still parse and be allowlisted.
 * - Per V2-FE-054 conventions this fails closed: any unknown scheme,
 *   unparseable value, or oversized input is rejected.
 */
export function safeUrl(rawUrl: unknown): SafeUrlCheck {
  const message = 'This link was blocked for security reasons.';

  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return { ok: false, reason: 'empty', message };
  }

  // Strip characters that can confuse URL parsers or hide schemes from
  // reviewers: control chars, whitespace inside the scheme, and bidi overrides.
  const cleaned = rawUrl
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim();

  if (cleaned.length === 0) {
    return { ok: false, reason: 'empty', message };
  }

  if (cleaned.length > MAX_URL_LENGTH) {
    return { ok: false, reason: 'too_long', message };
  }

  // Scheme check on the raw string catches `javascript:`-style payloads even
  // when a permissive URL parser would re-interpret them differently.
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);
  const scheme = schemeMatch ? schemeMatch[1].toLowerCase() + ':' : null;

  if (scheme !== null) {
    if ((UNSAFE_SCHEMES as readonly string[]).includes(scheme)) {
      return { ok: false, reason: 'unsafe_scheme', message };
    }
    if (scheme !== APP_SCHEME && !(SAFE_URL_SCHEMES as readonly string[]).includes(scheme)) {
      return { ok: false, reason: 'disallowed_scheme', message };
    }
  }

  // `app:` prefix is reserved for trusted in-app navigation built by the UI.
  if (scheme === APP_SCHEME || !scheme) {
    return { ok: false, reason: 'disallowed_scheme', message };
  }

  // Fail closed on whitespace/control characters smuggled into the scheme or
  // authority: they can hide the real destination (`ht\ntps://…`,
  // `https://exa mple.com`). Whitespace in the query/fragment is allowed
  // because the URL parser encodes it safely and it cannot change the origin.
  const rawTrimmed = rawUrl.trim();
  const rawSchemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(rawTrimmed);
  const rawScheme = rawSchemeMatch ? rawSchemeMatch[1] : '';
  if (/[\s\u0000-\u001f\u007f-\u009f]/.test(rawScheme)) {
    return { ok: false, reason: 'unsafe_hostname', message };
  }
  let rawAuthority = rawTrimmed.slice(rawScheme.length + 1);
  if (rawAuthority.startsWith('//')) {
    rawAuthority = rawAuthority.slice(2);
  }
  const authorityEnd = rawAuthority.search(/[/?#]/);
  if (authorityEnd !== -1) {
    rawAuthority = rawAuthority.slice(0, authorityEnd);
  }
  if (/[\s\u0000-\u001f\u007f-\u009f]/.test(rawAuthority)) {
    return { ok: false, reason: 'unsafe_hostname', message };
  }

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return { ok: false, reason: 'unparseable', message };
  }

  if (!(SAFE_URL_SCHEMES as readonly string[]).includes(parsed.protocol)) {
    return { ok: false, reason: 'disallowed_scheme', message };
  }

  if (parsed.protocol === 'https:') {
    if (!parsed.hostname || parsed.hostname.includes(' ')) {
      return { ok: false, reason: 'unsafe_hostname', message };
    }
  }

  return { ok: true, href: parsed.toString(), kind: 'external', url: parsed };
}

/**
 * Convert an `ipfs://<cid>/<path>` URI to an HTTPS gateway URL. Returns null
 * when the input is not a syntactically valid IPFS URI (fail closed).
 */
export function ipfsToHttp(ipfsUrl: string, gateway = 'https://ipfs.io'): string | null {
  if (typeof ipfsUrl !== 'string') return null;
  const match = /^ipfs:\/\/(?:ipfs\/)?([A-Za-z0-9]+)(\/[^?#]*)?$/.exec(ipfsUrl.trim());
  if (!match) return null;
  const [, cid, path] = match;
  return `${gateway}/ipfs/${cid}${path ?? ''}`;
}

// ---------------------------------------------------------------------------
// Evidence media (image) URLs
// ---------------------------------------------------------------------------

/**
 * Validate an untrusted image URL for evidence media. Only HTTPS URLs and
 * valid IPFS URIs are allowed; `data:`, `blob:`, `javascript:`, and any other
 * scheme are rejected.
 */
export function safeImageUrl(rawUrl: unknown): SafeUrlCheck {
  const result = safeUrl(rawUrl);
  if (!result.ok) return result;

  if (result.kind === 'app') {
    return {
      ok: false,
      reason: 'disallowed_scheme',
      message: 'This media was blocked for security reasons.',
    };
  }

  // ipfs: URIs are renderable after gateway conversion
  if (result.url.protocol === 'ipfs:') {
    const http = ipfsToHttp(result.href);
    if (!http) {
      return {
        ok: false,
        reason: 'unparseable',
        message: 'This media was blocked for security reasons.',
      };
    }
    try {
      return { ok: true, href: http, kind: 'external', url: new URL(http) };
    } catch {
      return {
        ok: false,
        reason: 'unparseable',
        message: 'This media was blocked for security reasons.',
      };
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Link hardening (rel / target)
// ---------------------------------------------------------------------------

/**
 * The `rel` attribute required for every link that opens in a new tab
 * (`target="_blank"`). Prevents reverse-tabnabbing and referrer leakage.
 */
export const SAFE_EXTERNAL_REL = 'noopener noreferrer nofollow';

/**
 * True when a `rel` attribute value is hardened for `target="_blank"` usage:
 * must contain `noopener` and `noreferrer`.
 */
export function isHardenedRel(rel: string | undefined | null): boolean {
  if (!rel) return false;
  const tokens = rel.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.includes('noopener') && tokens.includes('noreferrer');
}

// ---------------------------------------------------------------------------
// Text content
// ---------------------------------------------------------------------------

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/**
 * Sanitize untrusted text (claim titles, descriptions, evidence captions) for
 * safe rendering. We never build HTML strings from untrusted input, so the job
 * here is to strip control characters and trim hazardous padding — React's
 * text-node escaping handles the rest.
 *
 * IMPORTANT: the result must only ever be rendered as a React *text child*.
 * Passing it through `dangerouslySetInnerHTML` is forbidden (see the
 * regression guard in `src/__tests__/regression/evidence-rendering.test.ts`).
 */
export function sanitizeText(raw: unknown, maxLength = 10_000): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(CONTROL_CHARS, '').slice(0, maxLength);
}

// ---------------------------------------------------------------------------
// Evidence item sanitization
// ---------------------------------------------------------------------------

export interface RawEvidenceItem {
  type: string;
  value: string;
}

export type SafeEvidenceItem =
  | {
      kind: 'link';
      href: string;
      /** Always hardened; pair with target="_blank". */
      rel: typeof SAFE_EXTERNAL_REL;
      /** Display text, sanitized. */
      text: string;
    }
  | {
      kind: 'image';
      src: string;
      text: string;
    }
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'blocked';
      /** Why the original item was blocked, safe to render. */
      reason: string;
      /** Non-empty, sanitized preview of the blocked value (never rendered as HTML). */
      preview: string;
    };

/**
 * Sanitize one untrusted evidence item. Never throws; items that fail
 * validation become `kind: 'blocked'` so the UI can show a fail-closed,
 * accessible placeholder instead of silently dropping content.
 */
export function sanitizeEvidenceItem(
  item: RawEvidenceItem | null | undefined,
): SafeEvidenceItem {
  const block = (reason: string): SafeEvidenceItem => ({
    kind: 'blocked',
    reason,
    preview: sanitizeText(
      typeof item?.value === 'string' ? item.value.slice(0, 120) : '',
      160,
    ),
  });

  if (!item || typeof item !== 'object') {
    return block('Evidence item could not be displayed.');
  }

  const type = typeof item.type === 'string' ? item.type.toLowerCase() : '';
  const value = typeof item.value === 'string' ? item.value : '';

  if (type === 'link' || type === 'document' || type === 'video') {
    const check = safeUrl(value);
    if (!check.ok) {
      return block('This evidence link was blocked for security reasons.');
    }
    return {
      kind: 'link',
      href: check.href,
      rel: SAFE_EXTERNAL_REL,
      text: sanitizeText(value, 512),
    };
  }

  if (type === 'image') {
    const check = safeImageUrl(value);
    if (!check.ok) {
      return block('This evidence image was blocked for security reasons.');
    }
    return {
      kind: 'image',
      src: check.href,
      text: sanitizeText(value, 512),
    };
  }

  if (type === 'text') {
    const text = sanitizeText(value);
    if (text.length === 0) {
      return block('This evidence item is empty.');
    }
    return { kind: 'text', text };
  }

  return block('This evidence item has an unsupported type.');
}

/** Sanitize a list of evidence items, filtering nothing (blocked items are kept). */
export function sanitizeEvidenceList(
  items: readonly (RawEvidenceItem | null | undefined)[] | null | undefined,
): SafeEvidenceItem[] {
  if (!Array.isArray(items)) return [];
  return items.map(sanitizeEvidenceItem);
}
