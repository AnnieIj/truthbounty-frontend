'use client';

import { useEffect } from 'react';
import { RouteErrorFallback } from '@/components/common/RouteErrorFallback';

/**
 * Root route boundary. Fail closed: generic message only, safe retry.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Root route error:', error);
  }, [error]);

  return <RouteErrorFallback error={error} reset={reset} scope="Application" />;
}
