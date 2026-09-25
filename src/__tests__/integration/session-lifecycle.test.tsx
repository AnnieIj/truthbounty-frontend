/**
 * V2-FE-048 — Integration: session rotation + cross-tab revocation recovery.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionLifecycleProvider } from '@/components/providers/SessionLifecycleProvider';
import {
  buildSignedOutMessage,
  type SessionSyncMessage,
} from '@/lib/auth/session-lifecycle';
import { createMemorySessionStore } from '@/lib/auth/session-store';
import type { SiweSession } from '@/lib/auth/siwe-types';

function makeSyncChannel() {
  let handler: ((message: SessionSyncMessage) => void) | null = null;
  return {
    publish: jest.fn(),
    subscribe: jest.fn((h: (message: SessionSyncMessage) => void) => {
      handler = h;
      return () => {
        handler = null;
      };
    }),
    close: jest.fn(),
    emit: (message: SessionSyncMessage) => handler?.(message),
  };
}

function makeSession(overrides: Partial<SiweSession> = {}): SiweSession {
  const now = Date.now();
  return {
    address: '0x742d35cc6634c0532925a3b844bc9e7595f0eb1e',
    chainId: 10,
    token: 'token-1',
    expiresAt: now + 30_000,
    issuedAt: now,
    ...overrides,
  };
}

describe('Session lifecycle integration', () => {
  it('rotates a refresh-due session, then recovers from cross-tab revocation non-destructively', async () => {
    const store = createMemorySessionStore(() => Date.now());
    store.set(makeSession());
    const channel = makeSyncChannel();
    const refreshSession = jest.fn(async (current: SiweSession) => ({
      ...current,
      token: 'token-2',
      expiresAt: Date.now() + 3_600_000,
      issuedAt: Date.now(),
    }));

    render(
      <SessionLifecycleProvider
        sessionStore={store}
        refreshSession={refreshSession}
        syncChannel={channel as never}
      >
        <div>app content</div>
      </SessionLifecycleProvider>,
    );

    // The refresh-due session rotates automatically without a recovery banner.
    await waitFor(() => expect(store.get()?.token).toBe('token-2'));
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('session-lifecycle-banner')).not.toBeInTheDocument();
    expect(channel.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'rotated' }),
    );

    // Another tab revokes the session → accessible, non-destructive sign-out.
    channel.emit(buildSignedOutMessage('revoked'));
    await waitFor(() =>
      expect(screen.getByTestId('session-lifecycle-banner')).toHaveTextContent(/revoked/i),
    );
    expect(store.get()).toBeNull();

    // Explicit recovery dismisses the notice.
    await userEvent.click(screen.getByRole('button', { name: /sign in again/i }));
    await waitFor(() =>
      expect(screen.queryByTestId('session-lifecycle-banner')).not.toBeInTheDocument(),
    );
  });
});
