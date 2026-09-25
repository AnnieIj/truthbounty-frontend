
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MotionSafeStatus } from '@/components/ui/MotionSafeStatus';

export default function ClaimDetailRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/claims');
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        {/* Loading indicator */}
        <div className="relative mb-6 flex h-14 w-14 items-center justify-center">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900 dark:border-gray-800 dark:border-t-white" />

          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-gray-900">
            <svg
              className="h-4 w-4 text-gray-700 dark:text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12l-7.5 7.5M21 12H3"
              />
            </svg>
          </div>
        </div>

        {/* Message */}
        <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
          Opening claims
        </h1>

        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Redirecting you to your claims dashboard...
        </p>

        {/* Destination — V2-FE-071: status is text+color with an optional
            decorative pulse that is suppressed under reduced motion. */}
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <MotionSafeStatus label="Claims dashboard" tone="success" pulse />
        </div>
      </div>
    </main>
  );
}
