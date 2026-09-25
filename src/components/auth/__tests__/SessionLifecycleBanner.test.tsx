/**
 * V2-FE-048 — SessionLifecycleBanner states.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionLifecycleBanner } from '../SessionLifecycleBanner';

describe('SessionLifecycleBanner', () => {
  it('renders nothing for active or absent sessions', () => {
    const { container: active } = render(<SessionLifecycleBanner health="active" />);
    expect(active).toBeEmptyDOMElement();

    const { container: none } = render(<SessionLifecycleBanner health="none" />);
    expect(none).toBeEmptyDOMElement();
  });

  it('announces an expiring session and offers an explicit refresh', async () => {
    const onRefresh = jest.fn();
    render(<SessionLifecycleBanner health="refresh-due" onRefresh={onRefresh} />);

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(/expiring soon/i);

    await userEvent.click(screen.getByRole('button', { name: /refresh session now/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh control while refreshing', () => {
    render(<SessionLifecycleBanner health="refresh-due" isRefreshing onRefresh={jest.fn()} />);
    expect(screen.getByRole('button', { name: /refresh session now/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /refresh session now/i })).toHaveTextContent(
      /refreshing/i,
    );
  });

  it('returns to a non-destructive signed-out state when the session expires', async () => {
    const onSignInAgain = jest.fn();
    render(
      <SessionLifecycleBanner health="expired" onSignInAgain={onSignInAgain} />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/work is saved/i);

    await userEvent.click(screen.getByRole('button', { name: /sign in again/i }));
    expect(onSignInAgain).toHaveBeenCalledTimes(1);
  });

  it('explains reuse from another tab and still offers sign-in', () => {
    render(
      <SessionLifecycleBanner
        health="none"
        requiresReauth
        error={{ kind: 'REUSED', message: 'rotated elsewhere' }}
        onSignInAgain={jest.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/another tab/i);
  });

  it('keeps a retryable network failure recoverable', async () => {
    const onRefresh = jest.fn();
    render(
      <SessionLifecycleBanner
        health="active"
        error={{ kind: 'NETWORK', message: 'offline' }}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/work is saved/i);
    await userEvent.click(screen.getByRole('button', { name: /retry refreshing session/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
