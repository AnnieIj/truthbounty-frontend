'use client';

/**
 * V2-FE-144 — Accessible reorg / replacement banner.
 *
 * Renders the accessible view model produced by `useReorgReconciliation`:
 *  - `role="alert"` + `aria-live="assertive"` while a reorg/replacement is
 *    active (uncertainty must interrupt; success is never announced here).
 *  - Hashes are truncated for display; the explorer link title carries the
 *    full canonical value (opened in a new tab, `noopener`).
 *  - The acknowledge control is keyboard reachable with an accessible name.
 *  - No animation is applied when the user prefers reduced motion.
 *  - Renders nothing when the view state is `hidden` (no fabricated UI).
 */

import React from 'react';
import { AlertTriangle, ArrowRight, ExternalLink } from 'lucide-react';
import { getTransactionExplorerUrl } from '@/lib/explorer';
import type { ReorgBannerView } from '@/lib/reorg-reconciliation';

export interface ReorgBannerProps {
  view: ReorgBannerView;
  /** Acknowledge the reported outcome (dismisses the banner). */
  onAcknowledge?: () => void;
  /** Override the default OP Mainnet explorer link target chain. */
  chainId?: number;
}

export function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function announceText(view: ReorgBannerView): string {
  return `${view.message} ${view.detail}`.trim();
}

export function ReorgBanner({ view, onAcknowledge, chainId = 10 }: ReorgBannerProps) {
  if (view.state === 'hidden') {
    return null;
  }

  const icon =
    view.state === 'replacement-found' ? (
      <ArrowRight className="w-5 h-5 shrink-0 motion-safe:animate-none" aria-hidden="true" />
    ) : (
      <AlertTriangle className="w-5 h-5 shrink-0 motion-safe:animate-none" aria-hidden="true" />
    );

  return (
    <section
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      data-testid="reorg-banner"
      data-state={view.state}
      className="border rounded-lg px-4 py-3 flex flex-col gap-2 bg-amber-950/40 border-amber-500/40 text-amber-100"
    >
      <div className="flex items-start gap-3">
        {icon}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" data-testid="reorg-banner-message">
            {view.message}
          </p>
          <p className="text-sm mt-1 break-words" data-testid="reorg-banner-detail">
            {view.detail}
          </p>

          {(view.orphanedHash || view.replacementHash) && (
            <dl className="mt-2 space-y-1 text-xs">
              {view.orphanedHash && (
                <div className="flex items-center gap-2 flex-wrap">
                  <dt className="text-amber-300/80">Orphaned transaction:</dt>
                  <dd className="font-mono">
                    <span title={view.orphanedHash}>{truncateHash(view.orphanedHash)}</span>
                  </dd>
                </div>
              )}
              {view.replacementHash && (
                <div className="flex items-center gap-2 flex-wrap">
                  <dt className="text-amber-300/80">Replacement transaction:</dt>
                  <dd className="font-mono">
                    <a
                      href={getTransactionExplorerUrl(view.replacementHash, chainId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={view.replacementHash}
                      className="underline hover:no-underline"
                      data-testid="reorg-banner-replacement-link"
                    >
                      {truncateHash(view.replacementHash)}
                      <ExternalLink className="inline w-3 h-3 ml-1" aria-hidden="true" />
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>

      {/* Screen readers get the full announcement in one atomic region. */}
      <span className="sr-only">{announceText(view)}</span>

      {onAcknowledge && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onAcknowledge}
            data-testid="reorg-banner-acknowledge"
            className="text-sm underline rounded px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 hover:no-underline"
          >
            Acknowledge
          </button>
        </div>
      )}
    </section>
  );
}

export default ReorgBanner;
