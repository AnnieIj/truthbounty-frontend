'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import {
  sanitizeEvidenceList,
  SafeEvidenceItem,
} from '@/lib/security/evidence-sanitizer';

export interface EvidenceViewerProps {
  claimId: string;
  /**
   * Untrusted evidence items from the API. Defaults to the canonical sample
   * set used by the verification page; every item is sanitized before render.
   */
  evidence?: Array<{ type: string; value: string }>;
}

/**
 * V2-FE-075 — Evidence media/link/text rendering with fail-closed
 * sanitization. All content is treated as untrusted:
 *  - link values must pass the scheme allowlist (https/ipfs) or they render
 *    as an accessible "blocked" placeholder instead of an anchor
 *  - anchors always use target="_blank" + noopener noreferrer nofollow
 *  - images only render from https or valid ipfs URIs (data:/blob: rejected)
 *  - text renders as React text children only — no innerHTML, ever
 */
export function EvidenceViewer({
  claimId: _claimId,
  evidence: rawEvidence,
}: EvidenceViewerProps) {
  void _claimId;
  const [expanded, setExpanded] = useState(true);

  // Canonical default set used when the API payload is not wired through yet.
  // These go through the same sanitizer as untrusted content.
  const defaultEvidence = [
    { type: 'link', value: 'https://example.com' },
    { type: 'text', value: 'Witness testimony text' },
    { type: 'image', value: '/evidence/img1.png' },
  ];

  const evidence = sanitizeEvidenceList(rawEvidence ?? defaultEvidence);

  return (
    <div className="card p-4 sm:p-6">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls="evidence-content"
        className="flex items-center justify-between w-full font-semibold mb-3 text-base sm:text-lg text-left focus-visible:outline-2 focus-visible:outline-[#5b5bf6] focus-visible:outline-offset-2 rounded"
      >
        <span>Evidence</span>
        <span aria-hidden="true">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div
          id="evidence-content"
          data-testid="evidence-scroll-container"
          className="space-y-3 sm:space-y-3 overflow-y-auto overscroll-contain"
          style={{ maxHeight: '60vh', overscrollBehavior: 'contain' }}
        >
          {evidence.length === 0 && (
            <p className="text-sm text-gray-500">No evidence available.</p>
          )}

          {evidence.map((e: SafeEvidenceItem, idx) => {
            if (e.kind === 'link') {
              return (
                <a
                  key={idx}
                  href={e.href}
                  target="_blank"
                  rel={e.rel}
                  className="text-blue-600 underline text-sm sm:text-base break-all block py-1"
                  aria-label={`Evidence link: ${e.text} (opens in new tab)`}
                >
                  {e.text}
                </a>
              );
            }

            if (e.kind === 'image') {
              return (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={idx}
                  src={e.src}
                  alt="Evidence image"
                  className="rounded-lg max-h-40 sm:max-h-60 w-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              );
            }

            if (e.kind === 'blocked') {
              return (
                <p
                  key={idx}
                  className="flex items-start gap-2 text-sm text-gray-500 italic py-1"
                  role="note"
                  data-testid="evidence-blocked-item"
                >
                  <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{e.reason}</span>
                </p>
              );
            }

            return (
              <p key={idx} className="text-sm sm:text-base leading-relaxed">
                {e.text}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default EvidenceViewer;
