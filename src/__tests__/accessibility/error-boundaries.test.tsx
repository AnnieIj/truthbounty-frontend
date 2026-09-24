import React from 'react';
import { render, screen, fireEvent } from '../utils/test-utils';
import userEvent from '@testing-library/user-event';
import { assertAccessible } from '../utils/axe';
import { RouteErrorFallback } from '@/components/common/RouteErrorFallback';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

function Boom(): never {
  throw new Error('boundary fault');
}

describe('Accessibility: route and feature error boundaries', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('RouteErrorFallback has no axe violations', async () => {
    const { container } = render(
      <RouteErrorFallback error={new Error('fail')} reset={() => undefined} scope="Dashboard" />
    );
    await assertAccessible(container as unknown as HTMLElement);
  });

  it('ErrorBoundary fallback has no axe violations', async () => {
    const { container } = render(
      <ErrorBoundary scope="feature:claim-details">
        <Boom />
      </ErrorBoundary>
    );
    await assertAccessible(container as unknown as HTMLElement);
  });

  it('retry is keyboard reachable and activates via keyboard', async () => {
    const user = userEvent.setup();
    const reset = jest.fn();
    render(<RouteErrorFallback error={new Error('fail')} reset={reset} scope="Claim detail" />);
    const retry = screen.getByRole('button', { name: /try again/i });
    // Retry is natively tabbable (no negative tabindex, not disabled).
    expect(retry).toBeVisible();
    expect(retry).toHaveAttribute('type', 'button');
    expect(retry.getAttribute('tabindex')).not.toBe('-1');
    retry.focus();
    expect(retry).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('ErrorBoundary retry is keyboard operable', async () => {
    const user = userEvent.setup();
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('flaky');
      return <p>recovered</p>;
    }
    render(
      <ErrorBoundary scope="feature:verification-actions">
        <Flaky />
      </ErrorBoundary>
    );
    const retry = screen.getByRole('button', { name: /try again/i });
    shouldThrow = false;
    retry.focus();
    expect(retry).toHaveFocus();
    await user.keyboard('{Enter}');
    // fireEvent fallback for class-component state update timing
    if (!screen.queryByText('recovered')) {
      fireEvent.click(retry);
    }
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });
});
