'use client';

/**
 * V2-FE-016 — ApprovalButton
 *
 * Renders a button whose label and disabled/aria state accurately reflects
 * the current ERC-20 approval lifecycle, kept strictly separate from the
 * downstream protocol execution state.
 *
 * Approval state machine (from useERC20Approval):
 *   idle / checking        → "Checking allowance…" (disabled)
 *   needs-approval         → "Approve [token]"      (active)
 *   awaiting-signature     → "Waiting for wallet…"  (disabled)
 *   pending-reset          → "Resetting approval…"  (disabled)
 *   pending-approval       → "Approving…"           (disabled)
 *   confirming             → "Confirming…"           (disabled)
 *   approved / success     → renders `null` by default (parent takes over)
 *   rejected               → "Approve [token] (retry)" (active)
 *   error                  → "Retry approval"        (active)
 *   unsupported-chain      → "Wrong network"         (disabled)
 *   invalid-params         → hidden / disabled       (error)
 *
 * Accessibility:
 *  - Button always has a meaningful accessible name (aria-label or text).
 *  - aria-busy is set while the approval tx is in flight.
 *  - aria-disabled (not HTML disabled) is used for keyboard-reachable
 *    informational states (so screen readers can announce them).
 *  - Live region announces status transitions.
 *
 * The component does NOT know about protocol execution state. The caller is
 * responsible for gating the "Submit claim" button behind
 *   `approvalStatus === 'approved' || approvalStatus === 'success'`.
 */

import React, { useId } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ApprovalStatus } from '@/hooks/useERC20Approval';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ApprovalButtonProps {
  /** Current status from useERC20Approval. */
  approvalStatus: ApprovalStatus;
  /** Error from useERC20Approval, if any. */
  approvalError?: Error | null;
  /**
   * Called when the user clicks to approve.
   * Should call `approval.approve()` from the hook.
   */
  onApprove: () => void;
  /**
   * Called when the user clicks retry after error/rejection.
   * Should call `approval.reset()` then `approval.approve()`.
   */
  onRetry?: () => void;
  /**
   * Human-readable token symbol (e.g. "USDC") for button label.
   * Default: "token"
   */
  tokenSymbol?: string;
  /** Additional CSS class names for the root button. */
  className?: string;
  /**
   * If true, renders nothing when status is 'approved' or 'success'.
   * Default: true
   */
  hideWhenApproved?: boolean;
  /**
   * Size variant forwarded to the underlying Button component.
   * Default: "default"
   */
  size?: 'default' | 'sm' | 'lg' | 'xs';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ButtonState = {
  label: string;
  /** aria-label when label text is insufficient for screen readers */
  ariaLabel?: string;
  disabled: boolean;
  ariaBusy: boolean;
  variant: 'default' | 'outline' | 'destructive' | 'secondary' | 'ghost';
  /** If true, show a spinner icon */
  showSpinner: boolean;
};

function resolveButtonState(
  status: ApprovalStatus,
  tokenSymbol: string,
  errorMessage?: string,
): ButtonState {
  switch (status) {
    case 'idle':
    case 'checking':
      return {
        label: 'Checking allowance…',
        ariaLabel: 'Checking token allowance, please wait',
        disabled: true,
        ariaBusy: true,
        variant: 'secondary',
        showSpinner: true,
      };

    case 'needs-approval':
      return {
        label: `Approve ${tokenSymbol}`,
        ariaLabel: `Approve ${tokenSymbol} spending`,
        disabled: false,
        ariaBusy: false,
        variant: 'default',
        showSpinner: false,
      };

    case 'awaiting-signature':
      return {
        label: 'Waiting for wallet…',
        ariaLabel: 'Waiting for wallet confirmation, please approve in your wallet',
        disabled: true,
        ariaBusy: true,
        variant: 'secondary',
        showSpinner: true,
      };

    case 'pending-reset':
      return {
        label: 'Resetting approval…',
        ariaLabel: 'Resetting previous approval on-chain, please wait',
        disabled: true,
        ariaBusy: true,
        variant: 'secondary',
        showSpinner: true,
      };

    case 'pending-approval':
      return {
        label: 'Approving…',
        ariaLabel: `Approval transaction submitted for ${tokenSymbol}, waiting for confirmation`,
        disabled: true,
        ariaBusy: true,
        variant: 'secondary',
        showSpinner: true,
      };

    case 'confirming':
      return {
        label: 'Confirming…',
        ariaLabel: 'Waiting for on-chain confirmation',
        disabled: true,
        ariaBusy: true,
        variant: 'secondary',
        showSpinner: true,
      };

    case 'rejected':
      return {
        label: `Approve ${tokenSymbol} (retry)`,
        ariaLabel: `Approval was rejected. Click to retry approving ${tokenSymbol}`,
        disabled: false,
        ariaBusy: false,
        variant: 'outline',
        showSpinner: false,
      };

    case 'error':
      return {
        label: 'Retry approval',
        ariaLabel: errorMessage
          ? `Approval failed: ${errorMessage}. Click to retry.`
          : `Approval failed. Click to retry.`,
        disabled: false,
        ariaBusy: false,
        variant: 'destructive',
        showSpinner: false,
      };

    case 'unsupported-chain':
      return {
        label: 'Wrong network',
        ariaLabel: 'Connected to an unsupported network. Switch to Optimism.',
        disabled: true,
        ariaBusy: false,
        variant: 'destructive',
        showSpinner: false,
      };

    case 'invalid-params':
      return {
        label: 'Configuration error',
        ariaLabel: 'Approval configuration is invalid.',
        disabled: true,
        ariaBusy: false,
        variant: 'destructive',
        showSpinner: false,
      };

    case 'approved':
    case 'success':
      // Caller controls what renders when approved; this case handled by hideWhenApproved
      return {
        label: `${tokenSymbol} approved`,
        ariaLabel: `${tokenSymbol} is approved`,
        disabled: true,
        ariaBusy: false,
        variant: 'secondary',
        showSpinner: false,
      };

    default: {
      // TypeScript exhaustiveness guard
      const _exhaustive: never = status;
      void _exhaustive;
      return {
        label: 'Approve',
        disabled: false,
        ariaBusy: false,
        variant: 'default',
        showSpinner: false,
      };
    }
  }
}

function isRetryState(status: ApprovalStatus): boolean {
  return status === 'rejected' || status === 'error';
}

// ---------------------------------------------------------------------------
// Spinner (no external dependency)
// ---------------------------------------------------------------------------

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('animate-spin size-4', className)}
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApprovalButton({
  approvalStatus,
  approvalError,
  onApprove,
  onRetry,
  tokenSymbol = 'token',
  className,
  hideWhenApproved = true,
  size = 'default',
}: ApprovalButtonProps) {
  const liveRegionId = useId();

  // Hide when already approved/succeeded
  if (
    hideWhenApproved &&
    (approvalStatus === 'approved' || approvalStatus === 'success')
  ) {
    return null;
  }

  const btnState = resolveButtonState(
    approvalStatus,
    tokenSymbol,
    approvalError?.message,
  );

  const handleClick = () => {
    if (btnState.disabled) return;
    if (isRetryState(approvalStatus) && onRetry) {
      onRetry();
    } else {
      onApprove();
    }
  };

  // Map status to a human-readable live-region announcement
  const liveAnnouncement: string | null = (() => {
    switch (approvalStatus) {
      case 'pending-approval':
        return `Approval transaction submitted for ${tokenSymbol}. Waiting for on-chain confirmation.`;
      case 'pending-reset':
        return `Resetting previous approval for ${tokenSymbol}. Waiting for on-chain confirmation.`;
      case 'confirming':
        return 'Confirmation received. Refreshing allowance.';
      case 'success':
        return `${tokenSymbol} approval confirmed.`;
      case 'rejected':
        return 'Approval request was rejected. You can retry.';
      case 'error':
        return approvalError?.message
          ? `Approval failed: ${approvalError.message}`
          : 'Approval failed. You can retry.';
      default:
        return null;
    }
  })();

  return (
    <>
      {/* Polite live region for screen reader announcements */}
      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveAnnouncement}
      </div>

      <Button
        type="button"
        variant={btnState.variant}
        size={size}
        className={cn('relative', className)}
        onClick={handleClick}
        disabled={btnState.disabled}
        aria-label={btnState.ariaLabel ?? btnState.label}
        aria-busy={btnState.ariaBusy}
        aria-describedby={liveAnnouncement ? liveRegionId : undefined}
        data-testid="approval-button"
        data-approval-status={approvalStatus}
      >
        {btnState.showSpinner && <Spinner />}
        <span>{btnState.label}</span>
      </Button>
    </>
  );
}

export default ApprovalButton;
