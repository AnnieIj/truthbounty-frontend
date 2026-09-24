'use client';

/**
 * V2-FE-016 — AllowanceDisplay
 *
 * Renders the current ERC-20 allowance with accessible state feedback for
 * every async scenario: loading, empty (zero), sufficient, insufficient,
 * error, and unsupported-chain.
 *
 * This is a pure display component. It does not submit transactions.
 * All data flows in via props derived from useERC20Allowance.
 *
 * Accessibility:
 *  - Loading state uses aria-busy + a visible spinner with sr-only label.
 *  - Each status uses role="status" or role="alert" as appropriate.
 *  - Colour alone is never the sole differentiator (icon + label always present).
 *  - The component meets WCAG 2.1 AA contrast in both light and dark modes.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import type { AllowanceStatus } from '@/hooks/useERC20Allowance';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AllowanceDisplayProps {
  /** Status from useERC20Allowance. */
  status: AllowanceStatus;
  /** Current allowance in wei. */
  allowance: bigint | undefined;
  /** Required amount in wei (used to show sufficient/insufficient). */
  requiredAmount?: bigint;
  /** Human-readable token symbol (e.g. "USDC"). Default: "token" */
  tokenSymbol?: string;
  /** Token decimal places for human-readable display. Default: 18 */
  tokenDecimals?: number;
  /** Error from the allowance hook. */
  error?: Error | null;
  /** Additional CSS class on the root element. */
  className?: string;
  /**
   * If true, displays a compact inline badge.
   * If false (default), renders a descriptive block element.
   */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a raw wei bigint to a human-readable string with decimals. */
function formatTokenAmount(
  amount: bigint,
  decimals: number,
  symbol: string,
): string {
  if (decimals === 0) return `${amount.toString()} ${symbol}`;

  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fractional = amount % divisor;

  if (fractional === 0n) {
    return `${whole.toString()} ${symbol}`;
  }

  // Show up to 4 significant fractional digits
  const fracStr = fractional.toString().padStart(decimals, '0');
  const trimmed = fracStr.replace(/0+$/, '').slice(0, 4);
  return `${whole.toString()}.${trimmed} ${symbol}`;
}

// Spinner used for loading state
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('animate-spin size-4 flex-shrink-0', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// Check icon
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('size-4 flex-shrink-0', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// Warning icon
function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('size-4 flex-shrink-0', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
      />
    </svg>
  );
}

// Error icon
function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('size-4 flex-shrink-0', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l-6 6M9 9l6 6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AllowanceDisplay({
  status,
  allowance,
  requiredAmount,
  tokenSymbol = 'token',
  tokenDecimals = 18,
  error,
  className,
  compact = false,
}: AllowanceDisplayProps) {
  // Derived: is the allowance sufficient?
  const isSufficient =
    allowance !== undefined &&
    requiredAmount !== undefined &&
    allowance >= requiredAmount;

  const isZero = allowance === 0n;

  // Format amounts for display
  const allowanceText =
    allowance !== undefined
      ? formatTokenAmount(allowance, tokenDecimals, tokenSymbol)
      : undefined;

  const requiredText =
    requiredAmount !== undefined
      ? formatTokenAmount(requiredAmount, tokenDecimals, tokenSymbol)
      : undefined;

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (status === 'loading' || status === 'idle') {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading token allowance"
        className={cn(
          'flex items-center gap-2 text-sm text-muted-foreground',
          className,
        )}
        data-testid="allowance-display"
        data-allowance-status={status}
      >
        <Spinner />
        <span aria-hidden="true">Checking allowance…</span>
        <span className="sr-only">Checking token allowance, please wait.</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error states
  // ---------------------------------------------------------------------------

  if (status === 'error') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className={cn(
          'flex items-center gap-2 text-sm text-destructive',
          className,
        )}
        data-testid="allowance-display"
        data-allowance-status={status}
      >
        <ErrorIcon className="text-destructive" />
        <span>
          {error?.message
            ? `Could not read allowance: ${error.message}`
            : 'Could not read token allowance. Please try again.'}
        </span>
      </div>
    );
  }

  if (status === 'unsupported-chain') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className={cn(
          'flex items-center gap-2 text-sm text-destructive',
          className,
        )}
        data-testid="allowance-display"
        data-allowance-status={status}
      >
        <ErrorIcon className="text-destructive" />
        <span>Unsupported network. Switch to Optimism to check allowance.</span>
      </div>
    );
  }

  if (status === 'invalid-params') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className={cn(
          'flex items-center gap-2 text-sm text-destructive',
          className,
        )}
        data-testid="allowance-display"
        data-allowance-status={status}
      >
        <ErrorIcon className="text-destructive" />
        <span>Invalid token or spender address configuration.</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Success state — render allowance value
  // ---------------------------------------------------------------------------

  if (status === 'success') {
    if (compact) {
      return (
        <span
          role="status"
          className={cn(
            'inline-flex items-center gap-1 text-sm font-medium rounded-full px-2 py-0.5',
            isSufficient
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : isZero
                ? 'bg-muted text-muted-foreground'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
            className,
          )}
          data-testid="allowance-display"
          data-allowance-status={status}
          aria-label={
            allowanceText
              ? `Current allowance: ${allowanceText}${isSufficient ? ' (sufficient)' : ' (insufficient)'}`
              : 'Allowance not set'
          }
        >
          {isSufficient ? (
            <CheckIcon className="text-green-700 dark:text-green-300" />
          ) : !isZero ? (
            <WarningIcon className="text-yellow-700 dark:text-yellow-300" />
          ) : null}
          <span aria-hidden="true">{allowanceText ?? '0 ' + tokenSymbol}</span>
        </span>
      );
    }

    // Block display
    return (
      <div
        role="status"
        className={cn('flex flex-col gap-1 text-sm', className)}
        data-testid="allowance-display"
        data-allowance-status={status}
      >
        <div className="flex items-center gap-2">
          {isSufficient ? (
            <CheckIcon className="text-green-600 dark:text-green-400" />
          ) : !isZero ? (
            <WarningIcon className="text-yellow-600 dark:text-yellow-400" />
          ) : null}
          <span className="font-medium">
            {isZero
              ? `No ${tokenSymbol} allowance`
              : `Allowance: ${allowanceText}`}
          </span>
        </div>

        {requiredText && !isSufficient && (
          <p className="text-muted-foreground pl-6">
            Required: {requiredText}. You need to approve more {tokenSymbol}.
          </p>
        )}

        {requiredText && isSufficient && (
          <p className="text-muted-foreground pl-6">
            Required: {requiredText}. ✓ Sufficient
          </p>
        )}
      </div>
    );
  }

  // Fallback for any future statuses not yet mapped (fail closed — show nothing)
  return null;
}

export default AllowanceDisplay;
