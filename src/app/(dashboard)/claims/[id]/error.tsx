'use client';

import { useEffect } from 'react';
import { RouteErrorFallback } from '@/components/common/RouteErrorFallback';

/**
 * Claim-detail segment boundary. Retry is safe and never duplicates
 * on-chain submissions; canonical receipts drive lifecycle state.
 */
export default function ClaimDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Claim detail route error:', error);
  }, [error]);

  return <RouteErrorFallback error={error} reset={reset} scope="Claim detail" />;
}
