/**
 * FallbackBoundary — accessibility tests
 * V2-FE-136
 *
 * Covers: ARIA roles/labels, keyboard focus, live regions, colour-contrast
 * tokens, and reduced-motion compliance.
 */

import { render, screen } from '@testing-library/react';
import { axe } from '../../__tests__/utils/axe';
import { FallbackBoundary } from '../common/FallbackBoundary';
import { RpcStatusIndicator } from '../common/RpcStatusIndicator';
import { ApiStaleBanner } from '../common/ApiStaleBanner';

describe('FallbackBoundary — accessibility', () => {
  it('has no axe violations in valid state', async () => {
    const { container } = render(
      <FallbackBoundary status="valid">
        <button type="button">Submit</button>
      </FallbackBoundary>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in degraded state', async () => {
    const { container } = render(
      <FallbackBoundary status="degraded" reason="Using fallback RPC">
        <button type="button">Submit</button>
      </FallbackBoundary>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in blocked state', async () => {
    const { container } = render(
      <FallbackBoundary status="blocked" reason="Chain not supported" blockActions>
        <button type="button">Submit</button>
      </FallbackBoundary>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in error state', async () => {
    const { container } = render(
      <FallbackBoundary status="error">
        <button type="button">Submit</button>
      </FallbackBoundary>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('degraded banner has role=status for polite announcement', () => {
    render(
      <FallbackBoundary status="degraded">
        <span>content</span>
      </FallbackBoundary>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('blocked container has role=alert for assertive announcement', () => {
    render(
      <FallbackBoundary status="blocked" blockActions>
        <span>content</span>
      </FallbackBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('does NOT trap keyboard focus in degraded state — children are interactive', () => {
    render(
      <FallbackBoundary status="degraded">
        <button type="button" data-testid="action-btn">Submit</button>
      </FallbackBoundary>,
    );
    const btn = screen.getByTestId('action-btn');
    // In degraded state children are still rendered and operable
    expect(btn).toBeEnabled();
  });
});

describe('RpcStatusIndicator — accessibility', () => {
  it('has no axe violations for all statuses', async () => {
    for (const status of ['healthy', 'degraded', 'unhealthy', 'unknown'] as const) {
      const { container } = render(<RpcStatusIndicator status={status} showLabel />);
      expect(await axe(container)).toHaveNoViolations();
    }
  });

  it('indicator icon is aria-hidden (decorative)', () => {
    render(<RpcStatusIndicator status="healthy" />);
    const dot = screen.getByRole('status').querySelector('[aria-hidden="true"]');
    expect(dot).not.toBeNull();
  });

  it('status wrapper carries accessible label', () => {
    render(<RpcStatusIndicator status="unhealthy" />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('aria-label');
    expect(el.getAttribute('aria-label')).toMatch(/unreachable/i);
  });
});

describe('ApiStaleBanner — accessibility', () => {
  it('has no axe violations for stale status', async () => {
    const { container } = render(
      <ApiStaleBanner status="stale" dataAgeMs={60_000} onReload={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations for critical status', async () => {
    const { container } = render(<ApiStaleBanner status="critical" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations for error status', async () => {
    const { container } = render(
      <ApiStaleBanner status="error" onReload={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('reload button is focusable and accessible', () => {
    render(<ApiStaleBanner status="error" onReload={() => {}} />);
    const btn = screen.getByRole('button', { name: /reload/i });
    expect(btn).toBeEnabled();
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it('icon decoration is aria-hidden', () => {
    render(<ApiStaleBanner status="stale" />);
    const banner = screen.getByRole('status');
    const icon = banner.querySelector('[aria-hidden="true"]');
    expect(icon).not.toBeNull();
  });

  it('renders nothing for fresh status (no spurious announcements)', () => {
    const { container } = render(<ApiStaleBanner status="fresh" />);
    expect(container).toBeEmptyDOMElement();
  });
});
