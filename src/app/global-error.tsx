'use client';

import { RouteErrorFallback } from '@/components/common/RouteErrorFallback';

/**
 * Global error boundary. Must include its own <html>/<body> per Next.js.
 * Strictly generic copy — no stack traces or sensitive data.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <RouteErrorFallback error={error} reset={reset} scope="Application" preserveNotice={false} />
      </body>
    </html>
  );
}
