/**
 * V2-FE-048 — Accessibility + keyboard coverage for the session lifecycle UI.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { assertAccessible } from '../utils/axe';
import { SessionLifecycleBanner } from '@/components/auth';

describe('Accessibility: session lifecycle banner', () => {
  it('refresh-due banner has no axe violations and is keyboard operable', async () => {
    const onRefresh = jest.fn();
    const { container } = render(
      <SessionLifecycleBanner health="refresh-due" onRefresh={onRefresh} />,
    );
    await assertAccessible(container);

    await userEvent.tab();
    const button = screen.getByRole('button', { name: /refresh session now/i });
    expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('re-auth banner has no axe violations and is keyboard operable', async () => {
    const onSignInAgain = jest.fn();
    const { container } = render(
      <SessionLifecycleBanner health="expired" onSignInAgain={onSignInAgain} />,
    );
    await assertAccessible(container);

    await userEvent.tab();
    expect(screen.getByRole('button', { name: /sign in again/i })).toHaveFocus();
  });

  it('network-failure banner has no axe violations', async () => {
    const { container } = render(
      <SessionLifecycleBanner
        health="active"
        error={{ kind: 'NETWORK', message: 'offline' }}
        onRefresh={jest.fn()}
      />,
    );
    await assertAccessible(container);
  });
});
