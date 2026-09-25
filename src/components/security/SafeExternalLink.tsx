'use client';

import React from 'react';
import { safeUrl, SAFE_EXTERNAL_REL, isHardenedRel } from '@/lib/security/evidence-sanitizer';

export interface SafeExternalLinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target'> {
  /** Untrusted URL from API/evidence/claim content — validated before render. */
  href: string;
  /** Accessible name. Falls back to the sanitized URL text when omitted. */
  children?: React.ReactNode;
  rel?: string;
}

/**
 * V2-FE-075 — The only sanctioned way to render an untrusted external URL.
 *
 * Fail-closed behaviour:
 *  - the `href` is validated against the scheme allowlist (`safeUrl`)
 *  - `target="_blank"` + hardened `rel` are always applied
 *  - when the URL is unsafe the anchor is NOT rendered at all; callers render
 *    the accessible blocked fallback instead (see `useSafeExternalHref`)
 *
 * Trusted, developer-authored links (sidebar, docs, explorer chrome) may keep
 * their plain `<a>` usage, but any URL that originates from claim/evidence/API
 * content must go through this component.
 */
export function SafeExternalLink({ href, children, ...rest }: SafeExternalLinkProps) {
  const check = safeUrl(href);
  if (!check.ok) {
    // Fail closed: never render an anchor with an unvalidated href.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[SafeExternalLink] Blocked unsafe href (${check.reason}); render the blocked fallback instead.`,
      );
    }
    return null;
  }

  const rel = isHardenedRel(rest.rel) ? rest.rel : SAFE_EXTERNAL_REL;

  return (
    <a
      {...rest}
      href={check.href}
      target="_blank"
      rel={rel}
    >
      {children}
    </a>
  );
}

export default SafeExternalLink;
