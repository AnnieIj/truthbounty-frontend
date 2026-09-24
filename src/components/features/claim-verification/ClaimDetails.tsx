'use client';

import { useEffect, useState } from 'react';
import { getClaimById } from '@/app/lib/api';
import { Claim } from '@/app/types/claim';
import { useTrustForAddress } from '@/components/hooks/useTrust';
import TrustScoreTooltip from '@/components/ui/TrustScoreTooltip';
import { ClaimDetailsSkeleton } from '@/components/skeletons';
import {
  sanitizeEvidenceList,
  sanitizeText,
} from '@/lib/security/evidence-sanitizer';
import { SafeExternalLink } from '@/components/security/SafeExternalLink';

export interface ClaimDetailsProps {
  claimId?: string;
  claim?: Claim;
  isLoading?: boolean;
  onNotFound?: () => void;
}

export function ClaimDetails({ claimId, claim: initialClaim, isLoading: externalLoading = false, onNotFound }: ClaimDetailsProps) {
  const [fetchedClaim, setFetchedClaim] = useState<Claim | null>(null);
  const [internalLoading, setInternalLoading] = useState(!initialClaim && !!claimId);
  const [notFound, setNotFound] = useState(false);

  const claim = initialClaim || fetchedClaim;
  const isLoading = externalLoading || (!initialClaim && internalLoading);

  useEffect(() => {
    if (initialClaim || !claimId) return;
    setInternalLoading(true);
    setNotFound(false);
    getClaimById(claimId).then((data) => {
      setFetchedClaim(data);
      setInternalLoading(false);
    }).catch((err) => {
      if (err.message === 'CLAIM_NOT_FOUND') {
        setNotFound(true);
        onNotFound?.();
      }
      setInternalLoading(false);
    });
  }, [claimId, initialClaim, onNotFound]);

  const proposerAddress = claim?.proposer || claim?.claimantAddress;
  const proposerTrust = useTrustForAddress(proposerAddress);

  if (isLoading && !notFound) {
    return <ClaimDetailsSkeleton />;
  }

  if (notFound || !claim) {
    return (
      <div className="bg-[#18181b] border border-red-500/20 rounded-xl p-6 text-center">
        <h3 className="text-lg font-bold text-red-500 mb-2">Claim Not Found</h3>
        <p className="text-gray-400 text-sm">The requested claim does not exist or has been removed.</p>
      </div>
    );
  }

  // V2-FE-075 — claim content arrives from the API and is untrusted.
  const safeTitle = sanitizeText(claim.title, 300);
  const safeDescription = sanitizeText(claim.description, 5000);
  const safeCategory = claim.category ? sanitizeText(claim.category, 100) : null;
  const evidence = sanitizeEvidenceList(claim.evidence);

  return (
    <div className="bg-[#18181b] border border-[#232329] rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-[#232329] pb-4">
        <h2 className="text-xl font-bold text-white">{safeTitle}</h2>
        <span className="px-3 py-1 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded-full text-xs font-semibold uppercase tracking-wider">
          {claim.status}
        </span>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Description</h4>
        <p className="text-gray-200 text-sm leading-relaxed">{safeDescription}</p>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-[#232329] text-xs text-gray-400">
        <div>
          {claim.category ? (
            <>
              <span>Category: </span>
              <span className="text-gray-200 font-medium">{safeCategory ?? 'Uncategorized'}</span>
            </>
          ) : (
            <span>Category: Uncategorized</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span>Proposer Trust:</span>
          <span className="text-yellow-500 font-bold">{proposerTrust.reputation}</span>
          <TrustScoreTooltip />
        </div>
      </div>

      {evidence.length > 0 && (
        <div className="pt-4 border-t border-[#232329] space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Evidence</h4>
          <ul className="space-y-1">
            {evidence.map((ev, idx) => (
              <li key={idx} className="text-xs text-gray-300">
                {ev.kind === 'link' && (
                  <SafeExternalLink
                    href={ev.href}
                    className="text-blue-400 underline break-all"
                    aria-label={`Evidence link (opens in new tab)`}
                  >
                    {ev.text}
                  </SafeExternalLink>
                )}
                {ev.kind === 'image' && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={ev.src}
                    alt="Evidence image"
                    className="rounded max-h-40 w-auto"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}
                {ev.kind === 'text' && <span>{ev.text}</span>}
                {ev.kind === 'blocked' && (
                  <span className="text-gray-500 italic" role="note">
                    {ev.reason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
