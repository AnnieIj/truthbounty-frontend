/**
 * V2-FE-045 — WalletConnection accessible feedback + deterministic disconnect.
 *
 * Renders the wallet surface with a controllable provider and asserts:
 *  - every lifecycle state has accurate, non-visual (aria-live) feedback
 *  - disconnect goes through the deterministic wallet boundary
 *  - no axe violations and the disconnect control is keyboard operable
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { assertAccessible } from '../utils/axe';
import { WalletConnection } from '@/components/WalletConnection';

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

let mockAccount = {
  address: undefined as `0x${string}` | undefined,
  isConnected: false,
  isConnecting: false,
  isReconnecting: false,
  chainId: undefined as number | undefined,
  connector: undefined as { id: string } | undefined,
};

jest.mock('wagmi', () => ({
  useAccount: () => mockAccount,
  useConnect: () => ({ connect: mockConnect, isPending: false }),
  useDisconnect: () => ({ disconnect: mockDisconnect, disconnectAsync: jest.fn() }),
  useConnectors: () => [],
}));

const ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

function connectedAccount(chainId = 10) {
  return {
    address: ADDRESS,
    isConnected: true,
    isConnecting: false,
    isReconnecting: false,
    chainId,
    connector: { id: 'injected' },
  };
}

beforeEach(() => {
  localStorage.clear();
  mockConnect.mockClear();
  mockDisconnect.mockClear();
  mockAccount = {
    address: undefined,
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    chainId: undefined,
    connector: undefined,
  };
});

describe('WalletConnection — accessible lifecycle feedback', () => {
  it('announces a disconnected wallet and offers connect', () => {
    render(<WalletConnection />);

    expect(screen.getByRole('status')).toHaveTextContent('Wallet not connected.');
    expect(screen.getByRole('button', { name: 'Connect Wallet' })).toBeInTheDocument();
  });

  it('announces a connected wallet', () => {
    mockAccount = connectedAccount();
    render(<WalletConnection />);

    expect(screen.getByRole('status')).toHaveTextContent('Wallet connected.');
    expect(screen.getByRole('button', { name: /Copy wallet address/ })).toBeInTheDocument();
  });

  it('announces a reconnection in progress', () => {
    mockAccount = {
      ...mockAccount,
      isConnecting: false,
      isReconnecting: true,
    };
    render(<WalletConnection />);

    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting wallet.');
  });

  it('announces an unsupported network with recovery guidance', () => {
    mockAccount = connectedAccount(1);
    render(<WalletConnection />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Wallet is connected to an unsupported network. Switch to Optimism.',
    );
  });

  it('has no axe violations when disconnected or connected', async () => {
    const { container, unmount } = render(<WalletConnection />);
    await assertAccessible(container);
    unmount();

    mockAccount = connectedAccount();
    const connected = render(<WalletConnection />);
    await assertAccessible(connected.container);
  });
});

describe('WalletConnection — deterministic disconnect', () => {
  it('disconnects through the wallet boundary and clears the cached preference', async () => {
    mockAccount = connectedAccount();
    localStorage.setItem('truthbounty:wallet:connector', 'injected');
    render(<WalletConnection />);

    await userEvent.click(screen.getByRole('button', { name: 'Disconnect wallet' }));

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('truthbounty:wallet:connector')).toBeNull();
  });

  it('is operable from the keyboard', async () => {
    mockAccount = connectedAccount();
    render(<WalletConnection />);

    await userEvent.tab();
    const copyButton = screen.getByRole('button', { name: /Copy wallet address/ });
    expect(copyButton).toHaveFocus();

    await userEvent.tab();
    const disconnectButton = screen.getByRole('button', { name: 'Disconnect wallet' });
    expect(disconnectButton).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
