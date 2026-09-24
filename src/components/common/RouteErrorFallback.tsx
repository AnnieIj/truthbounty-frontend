'use client';

import { toSafeErrorMessage } from '@/lib/sanitize-error';

export interface RouteErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Route scope label, e.g. "dashboard" or "claim detail". */
  scope: string;
  /** Show pending-transaction preservation notice (default true). */
  preserveNotice?: boolean;
}

/**
 * Shared fallback for Next.js `error.tsx` route boundaries.
 * Uses canonical `reset()` for safe retry and never renders stacks.
 */
export function RouteErrorFallback({
  error,
  reset,
  scope,
  preserveNotice = true,
}: RouteErrorFallbackProps) {
  const message = toSafeErrorMessage(error);

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-label={`${scope} error`}
      className="flex min-h-[50vh] items-center justify-center px-4 py-12"
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          This section couldn&apos;t load
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{message}</p>
        {preserveNotice ? (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Your pending transactions are preserved. Retrying is safe and will not
            submit a duplicate transaction.
          </p>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            autoFocus
            type="button"
            onClick={reset}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
