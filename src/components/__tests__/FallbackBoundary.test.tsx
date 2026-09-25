/**
 * FallbackBoundary and accessory components — component tests
 * V2-FE-136
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FallbackBoundary } from '../common/FallbackBoundary';
import { RpcStatusIndicator } from '../common/RpcStatusIndicator';
import { ApiStaleBanner } from '../common/ApiStaleBanner';

describe('FallbackBoundary', () => {
  it('renders children when status is valid', () => {
    render(
      <FallbackBoundary status="valid">
        <span>Protocol actions</span>
      </FallbackBoundary>,
    );
    expect(screen.getByText('Protocol actions')).toBeInTheDocument();
    expect(screen.queryByTestId('fallback-boundary-blocked')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fallback-boundary-degraded')).not.toBeInTheDocument();
  });

  it('renders degraded banner alongside children when status is degraded', () => {
    render(
      <FallbackBoundary status="degraded" reason="Using fallback RPC">
        <span>Protocol actions</span>
      </FallbackBoundary>,
    );
    expect(screen.getByText('Protocol actions')).toBeInTheDocument();
    expect(screen.getByTestId('fallback-boundary-degraded')).toBeInTheDocument();
    expect(screen.getByText(/Using fallback RPC/i)).toBeInTheDocument();
  });

  it('degraded banner has role=status and aria-live=polite', () => {
    render(<FallbackBoundary status="degraded"><span>x</span></FallbackBoundary>);
    const banner = screen.getByTestId('fallback-boundary-degraded');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
  });

  it('renders blocked overlay when status is blocked', () => {
    render(
      <FallbackBoundary status="blocked" reason="Chain not supported" blockActions>
        <span>Protocol actions</span>
      </FallbackBoundary>,
    );
    expect(screen.getByTestId('fallback-boundary-blocked')).toBeInTheDocument();
    // Error banner rendered within the overlay
    expect(screen.getByTestId('fallback-boundary-error')).toBeInTheDocument();
  });

  it('blocked container inner error banner has role=alert and aria-live=assertive', () => {
    render(<FallbackBoundary status="blocked" blockActions><span>x</span></FallbackBoundary>);
    // The outer wrapper is a layout element; the inner IntegrityBlockedBanner carries the ARIA role.
    const errorBanner = screen.getByTestId('fallback-boundary-error');
    expect(errorBanner).toHaveAttribute('role', 'alert');
    expect(errorBanner).toHaveAttribute('aria-live', 'assertive');
  });

  it('renders custom fallback when provided for blocked status', () => {
    render(
      <FallbackBoundary status="blocked" fallback={<span>Custom fallback</span>}>
        <span>Should not show</span>
      </FallbackBoundary>,
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(screen.queryByText('Should not show')).not.toBeInTheDocument();
  });

  it('renders error status with blocked overlay', () => {
    render(
      <FallbackBoundary status="error" blockActions>
        <span>content</span>
      </FallbackBoundary>,
    );
    expect(screen.getByTestId('fallback-boundary-blocked')).toBeInTheDocument();
    // Use the inner error banner element directly to avoid ambiguity with nested text nodes.
    const errorBanner = screen.getByTestId('fallback-boundary-error');
    expect(errorBanner).toBeInTheDocument();
    expect(errorBanner).toHaveTextContent(/Integrity error/i);
  });
});

describe('RpcStatusIndicator', () => {
  it.each([
    ['healthy', 'RPC provider status: healthy'],
    ['degraded', /degraded/i],
    ['unhealthy', /unreachable/i],
    ['unknown', /unknown/i],
  ] as const)('renders accessible label for %s status', (status, expectedLabel) => {
    render(<RpcStatusIndicator status={status} />);
    const el = screen.getByTestId(`rpc-status-${status}`);
    expect(el).toHaveAttribute('role', 'status');
    const ariaLabel = el.getAttribute('aria-label') ?? '';
    if (typeof expectedLabel === 'string') {
      expect(ariaLabel).toContain(expectedLabel);
    } else {
      expect(ariaLabel).toMatch(expectedLabel);
    }
  });

  it('renders label text when showLabel=true', () => {
    render(<RpcStatusIndicator status="healthy" showLabel />);
    expect(screen.getByText(/RPC healthy/i)).toBeInTheDocument();
  });

  it('does not render label text when showLabel=false', () => {
    render(<RpcStatusIndicator status="degraded" showLabel={false} />);
    expect(screen.queryByText(/RPC degraded/i)).not.toBeInTheDocument();
  });
});

describe('ApiStaleBanner', () => {
  it('renders nothing when status is fresh', () => {
    const { container } = render(<ApiStaleBanner status="fresh" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when status is loading', () => {
    const { container } = render(<ApiStaleBanner status="loading" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders polite status banner for stale', () => {
    render(<ApiStaleBanner status="stale" dataAgeMs={45_000} />);
    const banner = screen.getByTestId('api-stale-banner-stale');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner).toHaveTextContent(/outdated/i);
  });

  it('renders assertive alert for critical staleness', () => {
    render(<ApiStaleBanner status="critical" dataAgeMs={400_000} />);
    const banner = screen.getByTestId('api-stale-banner-critical');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveAttribute('aria-live', 'assertive');
    expect(banner).toHaveTextContent(/stale/i);
  });

  it('renders assertive alert for unavailable', () => {
    render(<ApiStaleBanner status="unavailable" />);
    const banner = screen.getByTestId('api-stale-banner-unavailable');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveTextContent(/unavailable/i);
  });

  it('renders reload button when onReload is provided', async () => {
    const onReload = jest.fn();
    const user = userEvent.setup();
    render(<ApiStaleBanner status="error" onReload={onReload} />);
    const btn = screen.getByRole('button', { name: /reload/i });
    await user.click(btn);
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('does not render reload button when onReload is not provided', () => {
    render(<ApiStaleBanner status="stale" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
