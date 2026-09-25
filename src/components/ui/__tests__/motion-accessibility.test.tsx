import React from 'react';
import { render, screen } from '@testing-library/react';
import { usePrefersReducedMotion } from '@/hooks/useReducedMotion';
import { MotionSafeStatus } from '@/components/ui/MotionSafeStatus';
import { TimeRemainingNotice } from '@/components/ui/TimeRemainingNotice';
import { assertAccessible } from '@/__tests__/utils/axe';

type Listener = (e: { matches: boolean }) => void;

// -- test double for matchMedia -------------------------------------------------
let listeners: Set<Listener>;
let currentMatches: boolean;

function installMatchMedia() {
  listeners = new Set();
  currentMatches = false;
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: currentMatches,
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

function Probe() {
  const reduced = usePrefersReducedMotion();
  return <div data-testid="probe">{reduced ? 'reduced' : 'full'}</div>;
}

describe('usePrefersReducedMotion (in MotionSafeStatus/Probe)', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    installMatchMedia();
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('renders full motion by default', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('full');
  });

  it('reports reduced motion when the OS preference is set', () => {
    currentMatches = true;
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('reduced');
  });
});

describe('MotionSafeStatus — V2-FE-071 status comprehension', () => {
  beforeEach(() => {
    installMatchMedia();
  });

  it('always renders the label text (status never depends on motion)', () => {
    render(<MotionSafeStatus label="Pending" tone="pending" pulse />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('keeps the pulse class when motion is allowed', () => {
    render(<MotionSafeStatus label="Pending" tone="pending" pulse />);
    // The decorative dot is aria-hidden; assert via DOM query.
    const spans = document.querySelectorAll('span[aria-hidden="true"]');
    expect(spans.length).toBeGreaterThan(0);
    expect(spans[0].className).toContain('animate-pulse');
  });

  it('suppresses the pulse under reduced motion but keeps text + color', () => {
    currentMatches = true;
    render(<MotionSafeStatus label="Pending" tone="pending" pulse />);
    const spans = document.querySelectorAll('span[aria-hidden="true"]');
    expect(spans.length).toBeGreaterThan(0);
    expect(spans[0].className).not.toContain('animate-pulse');
    // Color + text cue still present
    expect(spans[0].className).toContain('bg-amber-500');
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('exposes the status as an ARIA live region so changes announce without motion', () => {
    render(<MotionSafeStatus label="Confirmed" tone="success" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
  });

  it('renders detail text in an sr-only span for screen readers', () => {
    render(
      <MotionSafeStatus label="Pending" tone="pending" detail="Waiting for canonical receipt." />,
    );
    expect(screen.getByText(/Waiting for canonical receipt\./)).toBeInTheDocument();
  });

  it('has no axe violations (full-motion context)', async () => {
    const { container } = render(
      <MotionSafeStatus label="Confirmed" tone="success" detail="Receipt is canonical." pulse />,
    );
    await assertAccessible(container);
  });

  it('has no axe violations (reduced-motion context)', async () => {
    currentMatches = true;
    const { container } = render(
      <MotionSafeStatus label="Confirmed" tone="success" detail="Receipt is canonical." pulse />,
    );
    await assertAccessible(container);
  });
});

describe('TimeRemainingNotice — time-sensitive actions without motion', () => {
  it('renders a text-only countdown for a normal window', () => {
    render(<TimeRemainingNotice secondsRemaining={90000} windowLabel="Dispute window" />);
    expect(screen.getByTestId('time-remaining-notice').textContent).toContain(
      'Dispute window closes in 1 day, 1 hour',
    );
  });

  it('emphasizes urgency via text style (no animation) when close to expiry', () => {
    render(<TimeRemainingNotice secondsRemaining={1200} windowLabel="Appeal window" />);
    const notice = screen.getByTestId('time-remaining-notice');
    expect(notice.textContent).toContain('Appeal window closes in');
    expect(notice.className).toContain('font-semibold');
  });

  it('renders an expired state in plain text', () => {
    render(<TimeRemainingNotice secondsRemaining={0} windowLabel="Dispute window" />);
    expect(screen.getByTestId('time-remaining-notice').textContent).toContain('closed.');
  });

  it('fails closed on unknown deadline — never fabricates a countdown', () => {
    render(<TimeRemainingNotice secondsRemaining={null} windowLabel="Dispute window" />);
    expect(screen.getByTestId('time-remaining-notice').textContent).toContain(
      'Deadline unknown',
    );
  });

  it('renders detail for screen readers', () => {
    render(
      <TimeRemainingNotice
        secondsRemaining={7200}
        windowLabel="Dispute window"
        detail="Deadline derived from canonical block records."
      />,
    );
    expect(screen.getByText(/Deadline derived from canonical block records\./)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <TimeRemainingNotice secondsRemaining={600} windowLabel="Dispute window" />,
    );
    await assertAccessible(container);
  });
});
