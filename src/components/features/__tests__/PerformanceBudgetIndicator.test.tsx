import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { PerformanceBudgetIndicator } from '../PerformanceBudgetIndicator';
import type { PerformanceBudgetStatus } from '@/lib/performance/budget-state';
import type { UsePerformanceBudgetReturn } from '@/hooks/usePerformanceBudget';

const baseReturn: UsePerformanceBudgetReturn = {
  status: 'idle',
  metrics: {},
  violations: [],
  measuredAt: null,
  isStale: false,
  isMonitoring: false,
  unsupportedReason: null,
  error: null,
  routeBudget: { route: '/', firstLoadJsKiB: 1850 },
  isSupported: true,
  retry: jest.fn(),
  reset: jest.fn(),
};

let mockReturn: UsePerformanceBudgetReturn = { ...baseReturn };

jest.mock('@/hooks/usePerformanceBudget', () => ({
  usePerformanceBudget: () => mockReturn,
}));

describe('PerformanceBudgetIndicator', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockReturn = { ...baseReturn };
  });

  it('renders the within-budget label and an accessible live region', () => {
    mockReturn = {
      ...baseReturn,
      status: 'within-budget',
      metrics: { LCP: 1200, CLS: 0.02 },
    };
    render(<PerformanceBudgetIndicator />);
    expect(screen.getByRole('button', { name: /Performance within budget/ })).toBeInTheDocument();
    const announcement = screen.getByTestId('performance-budget-announcement');
    expect(announcement).toHaveAttribute('role', 'status');
    expect(announcement).toHaveAttribute('aria-live', 'polite');
  });

  it('does not clutter the announcement when healthy and fresh', () => {
    mockReturn = { ...baseReturn, status: 'within-budget' };
    render(<PerformanceBudgetIndicator />);
    expect(screen.getByTestId('performance-budget-announcement').textContent).not.toContain(
      'stale',
    );
  });

  it('announces over-budget with the violation count', () => {
    mockReturn = {
      ...baseReturn,
      status: 'over-budget',
      metrics: { LCP: 9999 },
      violations: [{ name: 'LCP', value: 9999, budget: 2500 }],
    };
    render(<PerformanceBudgetIndicator />);
    expect(screen.getByText('Perf: over budget')).toBeInTheDocument();
    expect(screen.getByTestId('performance-budget-announcement').textContent).toContain(
      '1 measurement(s) exceed',
    );
  });

  it('toggles details via the trigger button (keyboard operable, aria-expanded)', () => {
    mockReturn = {
      ...baseReturn,
      status: 'over-budget',
      metrics: { LCP: 9999 },
      violations: [{ name: 'LCP', value: 9999, budget: 2500 }],
    };
    render(<PerformanceBudgetIndicator />);

    const trigger = screen.getByRole('button', { name: /Performance over budget/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const details = screen.getByTestId('performance-budget-details');
    expect(within(details).getAllByText('LCP').length).toBeGreaterThanOrEqual(1);
    expect(details).toHaveTextContent('9999.00 ms / 2500.00');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('performance-budget-details')).not.toBeInTheDocument();
  });

  it('renders measured metric entries in the details panel', () => {
    mockReturn = {
      ...baseReturn,
      status: 'within-budget',
      metrics: { CLS: 0.02, LCP: 1200 },
    };
    render(<PerformanceBudgetIndicator />);
    fireEvent.click(screen.getByRole('button', { name: /Performance within budget/ }));
    const details = screen.getByTestId('performance-budget-details');
    expect(details).toHaveTextContent('LCP');
    expect(details).toHaveTextContent('1200.00 ms');
    expect(details).toHaveTextContent('CLS');
    expect(details).toHaveTextContent('0.02');
  });

  it('surfaces unsupported browsers without fabricating a result', () => {
    mockReturn = {
      ...baseReturn,
      status: 'unsupported',
      error: 'PerformanceObserver is not available in this browser.',
      isSupported: false,
    };
    render(<PerformanceBudgetIndicator />);
    const trigger = screen.getByRole('button', { name: /Performance budget: not supported/ });
    fireEvent.click(trigger);
    const details = screen.getByTestId('performance-budget-details');
    expect(details).toHaveTextContent('PerformanceObserver is not available');
  });

  it('re-measure triggers retry', () => {
    const retry = jest.fn();
    mockReturn = { ...baseReturn, status: 'unknown', retry };
    render(<PerformanceBudgetIndicator />);
    fireEvent.click(screen.getByRole('button', { name: /could not measure/ }));
    fireEvent.click(screen.getByRole('button', { name: /Re-measure/ }));
    expect(retry).toHaveBeenCalled();
  });

  it('flags stale measurements with a non-color signal', () => {
    mockReturn = { ...baseReturn, status: 'within-budget', isStale: true };
    const { container } = render(<PerformanceBudgetIndicator />);
    expect(container).toHaveTextContent('stale');
    expect(screen.getByTestId('performance-budget-announcement').textContent).toContain(
      'Measurement is stale',
    );
  });

  it('does not animate when reduced motion is preferred', () => {
    mockReturn = { ...baseReturn, status: 'measuring', isMonitoring: true };
    const listeners: Array<(event: { matches: boolean }) => void> = [];
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: (_: string, cb: (event: { matches: boolean }) => void) =>
        listeners.push(cb),
      removeEventListener: jest.fn(),
    }));
    const { container, unmount } = render(<PerformanceBudgetIndicator showLabel={false} />);
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(container.querySelector('.animate-spin')).toBeNull();
    unmount();
  });

  it('hides the textual label when showLabel is false', () => {
    mockReturn = { ...baseReturn, status: 'measuring' };
    render(<PerformanceBudgetIndicator showLabel={false} />);
    expect(screen.getByRole('button', { name: /Measuring performance/ })).toBeInTheDocument();
    expect(screen.queryByText(/^Perf:/)).not.toBeInTheDocument();
  });

  for (const status of ['idle', 'measuring'] as PerformanceBudgetStatus[]) {
    it(`renders a stable button for status ${status}`, () => {
      mockReturn = { ...baseReturn, status };
      render(<PerformanceBudgetIndicator route="/" />);
      expect(
        screen.getByRole('button', { name: RegExp(status === 'idle' ? 'not started' : 'Measuring') }),
      ).toBeInTheDocument();
    });
  }
});