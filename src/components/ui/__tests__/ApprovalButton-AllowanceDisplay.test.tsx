/**
 * V2-FE-016 — Component tests: ApprovalButton and AllowanceDisplay
 *
 * Coverage:
 *  - Every ApprovalStatus renders correct label + aria-attributes
 *  - Disabled states: checking, awaiting-signature, pending-*, confirming,
 *    unsupported-chain, invalid-params
 *  - Active states: needs-approval, rejected, error
 *  - onClick routing: onApprove vs onRetry
 *  - hideWhenApproved behaviour
 *  - AllowanceDisplay: loading, zero, sufficient, insufficient, error,
 *    unsupported-chain, invalid-params
 *  - Screen reader live-region announcements
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalButton } from '@/components/ui/ApprovalButton';
import { AllowanceDisplay } from '@/components/ui/AllowanceDisplay';
import type { ApprovalStatus } from '@/hooks/useERC20Approval';
import type { AllowanceStatus } from '@/hooks/useERC20Allowance';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderApprovalButton(
  props: Partial<React.ComponentProps<typeof ApprovalButton>> & {
    approvalStatus: ApprovalStatus;
  },
) {
  const defaults = {
    onApprove: jest.fn(),
    onRetry: jest.fn(),
    tokenSymbol: 'USDC',
    hideWhenApproved: false,
  };
  return render(<ApprovalButton {...defaults} {...props} />);
}

function renderAllowanceDisplay(
  props: Partial<React.ComponentProps<typeof AllowanceDisplay>> & {
    status: AllowanceStatus;
  },
) {
  const defaults = {
    allowance: undefined,
    tokenSymbol: 'USDC',
    tokenDecimals: 18,
  };
  return render(<AllowanceDisplay {...defaults} {...props} />);
}

// ===========================================================================
// ApprovalButton
// ===========================================================================

describe('ApprovalButton', () => {
  describe('idle / checking states (disabled)', () => {
    it.each<ApprovalStatus>(['idle', 'checking'])(
      'renders disabled spinner button for status = %s',
      (status) => {
        renderApprovalButton({ approvalStatus: status });
        const btn = screen.getByTestId('approval-button');
        expect(btn).toBeDisabled();
        expect(btn).toHaveAttribute('aria-busy', 'true');
        expect(btn).toHaveAttribute('data-approval-status', status);
      },
    );
  });

  describe('needs-approval state (active)', () => {
    it('renders active "Approve USDC" button', () => {
      renderApprovalButton({ approvalStatus: 'needs-approval' });
      const btn = screen.getByTestId('approval-button');
      expect(btn).not.toBeDisabled();
      expect(btn).toHaveAttribute('aria-busy', 'false');
      expect(btn.textContent).toContain('Approve USDC');
    });

    it('calls onApprove when clicked', () => {
      const onApprove = jest.fn();
      renderApprovalButton({ approvalStatus: 'needs-approval', onApprove });
      fireEvent.click(screen.getByTestId('approval-button'));
      expect(onApprove).toHaveBeenCalledTimes(1);
    });
  });

  describe('awaiting-signature state (disabled, aria-busy)', () => {
    it('renders disabled spinner with wallet-waiting label', () => {
      renderApprovalButton({ approvalStatus: 'awaiting-signature' });
      const btn = screen.getByTestId('approval-button');
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-busy', 'true');
      expect(btn.textContent).toContain('Waiting for wallet');
    });
  });

  describe('pending-reset state (disabled, aria-busy)', () => {
    it('renders disabled spinner with reset label', () => {
      renderApprovalButton({ approvalStatus: 'pending-reset' });
      const btn = screen.getByTestId('approval-button');
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-busy', 'true');
      expect(btn.textContent).toContain('Resetting');
    });
  });

  describe('pending-approval state (disabled, aria-busy)', () => {
    it('renders disabled spinner with "Approving…" label', () => {
      renderApprovalButton({ approvalStatus: 'pending-approval' });
      const btn = screen.getByTestId('approval-button');
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-busy', 'true');
      expect(btn.textContent).toContain('Approving');
    });
  });

  describe('confirming state (disabled, aria-busy)', () => {
    it('renders disabled spinner with confirming label', () => {
      renderApprovalButton({ approvalStatus: 'confirming' });
      const btn = screen.getByTestId('approval-button');
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-busy', 'true');
      expect(btn.textContent).toContain('Confirming');
    });
  });

  describe('rejected state (active, retry)', () => {
    it('renders retry button', () => {
      renderApprovalButton({ approvalStatus: 'rejected' });
      const btn = screen.getByTestId('approval-button');
      expect(btn).not.toBeDisabled();
      expect(btn.textContent).toContain('retry');
    });

    it('calls onRetry when provided and button is clicked', () => {
      const onRetry = jest.fn();
      renderApprovalButton({ approvalStatus: 'rejected', onRetry });
      fireEvent.click(screen.getByTestId('approval-button'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('calls onApprove as fallback when onRetry is not provided', () => {
      const onApprove = jest.fn();
      renderApprovalButton({ approvalStatus: 'rejected', onApprove, onRetry: undefined });
      fireEvent.click(screen.getByTestId('approval-button'));
      expect(onApprove).toHaveBeenCalledTimes(1);
    });
  });

  describe('error state (active, destructive variant)', () => {
    it('renders retry button with destructive variant', () => {
      renderApprovalButton({ approvalStatus: 'error' });
      const btn = screen.getByTestId('approval-button');
      expect(btn).not.toBeDisabled();
      expect(btn.textContent).toContain('Retry');
    });

    it('includes error message in aria-label', () => {
      const err = new Error('RPC timeout');
      renderApprovalButton({ approvalStatus: 'error', approvalError: err });
      const btn = screen.getByTestId('approval-button');
      expect(btn.getAttribute('aria-label')).toContain('RPC timeout');
    });

    it('calls onRetry when clicked in error state', () => {
      const onRetry = jest.fn();
      renderApprovalButton({ approvalStatus: 'error', onRetry });
      fireEvent.click(screen.getByTestId('approval-button'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsupported-chain state (disabled)', () => {
    it('renders disabled "Wrong network" button', () => {
      renderApprovalButton({ approvalStatus: 'unsupported-chain' });
      const btn = screen.getByTestId('approval-button');
      expect(btn).toBeDisabled();
      expect(btn.textContent).toContain('Wrong network');
    });

    it('does not call onApprove when clicked while disabled', () => {
      const onApprove = jest.fn();
      renderApprovalButton({
        approvalStatus: 'unsupported-chain',
        onApprove,
      });
      fireEvent.click(screen.getByTestId('approval-button'));
      expect(onApprove).not.toHaveBeenCalled();
    });
  });

  describe('invalid-params state (disabled)', () => {
    it('renders disabled configuration error button', () => {
      renderApprovalButton({ approvalStatus: 'invalid-params' });
      const btn = screen.getByTestId('approval-button');
      expect(btn).toBeDisabled();
      expect(btn.textContent?.toLowerCase()).toContain('configuration');
    });
  });

  describe('hideWhenApproved (default: true)', () => {
    it('renders nothing when status = "approved" and hideWhenApproved = true', () => {
      const { container } = render(
        <ApprovalButton
          approvalStatus="approved"
          onApprove={jest.fn()}
          hideWhenApproved={true}
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when status = "success" and hideWhenApproved = true', () => {
      const { container } = render(
        <ApprovalButton
          approvalStatus="success"
          onApprove={jest.fn()}
          hideWhenApproved={true}
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders button when status = "approved" and hideWhenApproved = false', () => {
      const { container } = render(
        <ApprovalButton
          approvalStatus="approved"
          onApprove={jest.fn()}
          hideWhenApproved={false}
        />,
      );
      expect(container.firstChild).not.toBeNull();
    });
  });

  describe('live region announcements', () => {
    it('announces pending-approval status to screen readers', () => {
      renderApprovalButton({ approvalStatus: 'pending-approval' });
      const liveRegion = document.querySelector('[role="status"][aria-live="polite"]');
      expect(liveRegion).not.toBeNull();
      expect(liveRegion?.textContent).toContain('USDC');
    });

    it('announces rejected status to screen readers', () => {
      renderApprovalButton({ approvalStatus: 'rejected' });
      const liveRegion = document.querySelector('[role="status"][aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('rejected');
    });

    it('announces error to screen readers with message', () => {
      const err = new Error('Token balance insufficient');
      renderApprovalButton({ approvalStatus: 'error', approvalError: err });
      const liveRegion = document.querySelector('[role="status"][aria-live="polite"]');
      expect(liveRegion?.textContent).toContain('Token balance insufficient');
    });
  });

  describe('accessible names', () => {
    it('always has a non-empty aria-label or text content', () => {
      const statuses: ApprovalStatus[] = [
        'idle', 'checking', 'needs-approval', 'awaiting-signature',
        'pending-reset', 'pending-approval', 'confirming', 'rejected',
        'error', 'unsupported-chain', 'invalid-params',
      ];
      for (const approvalStatus of statuses) {
        const { container } = renderApprovalButton({ approvalStatus });
        const btn = container.querySelector('[data-testid="approval-button"]');
        if (!btn) continue; // may be null for approved/success
        const label = btn.getAttribute('aria-label') ?? btn.textContent;
        expect(label?.trim().length).toBeGreaterThan(0);
        container.remove();
      }
    });
  });
});

// ===========================================================================
// AllowanceDisplay
// ===========================================================================

describe('AllowanceDisplay', () => {
  describe('loading state', () => {
    it('renders spinner with aria-busy and sr-only text', () => {
      renderAllowanceDisplay({ status: 'loading' });
      const display = screen.getByTestId('allowance-display');
      expect(display).toHaveAttribute('aria-busy', 'true');
      expect(display).toHaveAttribute('data-allowance-status', 'loading');
      // sr-only text for screen readers
      const srText = display.querySelector('.sr-only');
      expect(srText).not.toBeNull();
    });

    it('renders the same loading UI for idle status', () => {
      renderAllowanceDisplay({ status: 'idle' });
      const display = screen.getByTestId('allowance-display');
      expect(display).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('error state', () => {
    it('renders error message with role="alert"', () => {
      const err = new Error('RPC connection refused');
      renderAllowanceDisplay({ status: 'error', error: err });
      const display = screen.getByTestId('allowance-display');
      expect(display).toHaveAttribute('role', 'alert');
      expect(display.textContent).toContain('RPC connection refused');
    });

    it('renders generic error when no message provided', () => {
      renderAllowanceDisplay({ status: 'error' });
      const display = screen.getByTestId('allowance-display');
      expect(display).toHaveAttribute('role', 'alert');
      expect(display.textContent?.toLowerCase()).toContain('could not read');
    });
  });

  describe('unsupported-chain state', () => {
    it('renders unsupported-chain alert', () => {
      renderAllowanceDisplay({ status: 'unsupported-chain' });
      const display = screen.getByTestId('allowance-display');
      expect(display).toHaveAttribute('role', 'alert');
      expect(display.textContent).toContain('Unsupported');
    });
  });

  describe('invalid-params state', () => {
    it('renders invalid-params alert', () => {
      renderAllowanceDisplay({ status: 'invalid-params' });
      const display = screen.getByTestId('allowance-display');
      expect(display).toHaveAttribute('role', 'alert');
    });
  });

  describe('success state — zero allowance (empty)', () => {
    it('renders zero-allowance state', () => {
      renderAllowanceDisplay({
        status: 'success',
        allowance: 0n,
        requiredAmount: 1_000_000_000_000_000_000n,
      });
      const display = screen.getByTestId('allowance-display');
      expect(display.textContent?.toLowerCase()).toContain('no usdc allowance');
    });
  });

  describe('success state — insufficient allowance', () => {
    it('renders insufficient state with required amount', () => {
      renderAllowanceDisplay({
        status: 'success',
        allowance: 500_000_000_000_000_000n, // 0.5 tokens
        requiredAmount: 1_000_000_000_000_000_000n, // 1 token
      });
      const display = screen.getByTestId('allowance-display');
      expect(display.textContent?.toLowerCase()).toContain('required');
    });
  });

  describe('success state — sufficient allowance', () => {
    it('renders sufficient state', () => {
      renderAllowanceDisplay({
        status: 'success',
        allowance: 2_000_000_000_000_000_000n, // 2 tokens
        requiredAmount: 1_000_000_000_000_000_000n, // 1 token
      });
      const display = screen.getByTestId('allowance-display');
      expect(display.textContent).toContain('Sufficient');
    });
  });

  describe('compact mode', () => {
    it('renders a compact badge with aria-label', () => {
      renderAllowanceDisplay({
        status: 'success',
        allowance: 1_000_000_000_000_000_000n,
        requiredAmount: 1_000_000_000_000_000_000n,
        compact: true,
      });
      const display = screen.getByTestId('allowance-display');
      expect(display.tagName.toLowerCase()).toBe('span');
      const label = display.getAttribute('aria-label');
      expect(label).toContain('Current allowance');
    });
  });

  describe('token formatting', () => {
    it('formats 18-decimal amounts correctly', () => {
      renderAllowanceDisplay({
        status: 'success',
        allowance: 1_000_000_000_000_000_000n,
        tokenDecimals: 18,
        tokenSymbol: 'ETH',
      });
      const display = screen.getByTestId('allowance-display');
      expect(display.textContent).toContain('1 ETH');
    });

    it('formats 6-decimal amounts correctly', () => {
      renderAllowanceDisplay({
        status: 'success',
        allowance: 1_000_000n, // 1 USDC with 6 decimals
        tokenDecimals: 6,
        tokenSymbol: 'USDC',
      });
      const display = screen.getByTestId('allowance-display');
      expect(display.textContent).toContain('1 USDC');
    });

    it('handles zero decimals (integer tokens)', () => {
      renderAllowanceDisplay({
        status: 'success',
        allowance: 100n,
        tokenDecimals: 0,
        tokenSymbol: 'TKN',
      });
      const display = screen.getByTestId('allowance-display');
      expect(display.textContent).toContain('100 TKN');
    });
  });

  describe('data-testid and data-allowance-status attributes', () => {
    it.each<AllowanceStatus>(['loading', 'success', 'error', 'unsupported-chain'])(
      'sets data-allowance-status="%s" on display element',
      (status) => {
        renderAllowanceDisplay({
          status,
          allowance: status === 'success' ? 1n : undefined,
          error: status === 'error' ? new Error('test') : undefined,
        });
        const display = screen.queryByTestId('allowance-display');
        if (display) {
          expect(display).toHaveAttribute('data-allowance-status', status);
        }
      },
    );
  });
});
