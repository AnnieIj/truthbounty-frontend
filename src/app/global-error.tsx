'use client';

import { useEffect } from 'react';
import { RouteErrorFallback } from '@/components/common/RouteErrorFallback';
import { redactError } from '@/lib/security/redaction';

/**
 * Global error boundary. Must include its own <html>/<body> per Next.js.
 * Strictly generic copy — no stack traces or sensitive data.
 *
 * All errors are routed through `redactError` before being logged or rendered
 * so that secrets, long hex, and Bearer tokens never reach the console or DOM.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const redacted = redactError(error);

  useEffect(() => {
    console.error(
      'GlobalError caught:',
      redacted.name,
      redacted.message,
      redacted.stack,
      { cause: redacted.cause, digest: error.digest },
    );
  }, [redacted, error.digest]);

  const safeError: Error & { digest?: string } = {
    name: redacted.name,
    message: redacted.message,
    stack: redacted.stack ?? undefined,
    digest: error.digest,
  } as Error & { digest?: string };

  return (
    <html lang="en">
      <body>
        <RouteErrorFallback error={safeError} reset={reset} scope="Application" preserveNotice={false} />
      </body>
    </html>
  );
}
