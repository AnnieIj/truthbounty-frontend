import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SafeSiweAuth } from '../SafeSiweAuth';
import * as useSiweAuthModule from '@/hooks/useSiweAuth';
import * as useAccountModule from '@/hooks/useAccount';

// Mock dependencies
jest.mock('@/hooks/useSiweAuth');
jest.mock('@/hooks/useAccount');

const mockUseSiweAuth = useSiweAuthModule.useSiweAuth as jest.Mock;
const mockUseAccount = useAccountModule.useAccount as jest.Mock;

describe('SafeSiweAuth Component', () => {
  const defaultAuthMock = {
    status: 'idle',
    error: null,
    isAuthenticated: false,
    isBusy: false,
    begin: jest.fn(),
    signAndSubmit: jest.fn(),
    clear: jest.fn(),
    resetError: jest.fn(),
    address: '0x1234567890abcdef1234567890abcdef12345678',
    displayMessage: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAccount.mockReturnValue({ isDisconnected: false });
    mockUseSiweAuth.mockReturnValue(defaultAuthMock);
  });

  it('renders disconnected state when wallet is not connected', () => {
    mockUseAccount.mockReturnValue({ isDisconnected: true });
    render(<SafeSiweAuth />);
    expect(screen.getByText('Wallet Disconnected')).toBeInTheDocument();
  });

  it('renders idle state with Begin Sign-In button', () => {
    render(<SafeSiweAuth />);
    expect(screen.getByText('Sign In With Ethereum')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /begin sign-in/i })).toBeInTheDocument();
  });

  it('calls begin when Begin Sign-In is clicked', () => {
    render(<SafeSiweAuth />);
    fireEvent.click(screen.getByRole('button', { name: /begin sign-in/i }));
    expect(defaultAuthMock.begin).toHaveBeenCalled();
  });

  it('renders requesting-challenge state', () => {
    mockUseSiweAuth.mockReturnValue({ ...defaultAuthMock, status: 'requesting-challenge', isBusy: true });
    render(<SafeSiweAuth />);
    expect(screen.getByText('Preparing Sign-In')).toBeInTheDocument();
    expect(screen.getByText(/requesting secure challenge/i)).toBeInTheDocument();
  });

  it('renders ready-to-sign state and calls signAndSubmit', () => {
    const displayMessage = 'Sign this message to authenticate';
    mockUseSiweAuth.mockReturnValue({ ...defaultAuthMock, status: 'ready-to-sign', displayMessage });
    render(<SafeSiweAuth />);
    
    expect(screen.getByText('Review Message')).toBeInTheDocument();
    expect(screen.getByText(displayMessage)).toBeInTheDocument();
    
    fireEvent.click(screen.getByRole('button', { name: /sign message/i }));
    expect(defaultAuthMock.signAndSubmit).toHaveBeenCalled();
  });

  it('renders signing and submitting states', () => {
    mockUseSiweAuth.mockReturnValue({ ...defaultAuthMock, status: 'signing', isBusy: true });
    const { rerender } = render(<SafeSiweAuth />);
    expect(screen.getByText('Awaiting Signature')).toBeInTheDocument();

    mockUseSiweAuth.mockReturnValue({ ...defaultAuthMock, status: 'submitting', isBusy: true });
    rerender(<SafeSiweAuth />);
    expect(screen.getByText('Verifying')).toBeInTheDocument();
  });

  it('renders error state and handles Cancel', () => {
    mockUseSiweAuth.mockReturnValue({ 
      ...defaultAuthMock, 
      status: 'error', 
      error: { message: 'User rejected signature' } 
    });
    
    const { rerender } = render(<SafeSiweAuth />);
    expect(screen.getByText('Sign-In Failed')).toBeInTheDocument();
    expect(screen.getByText('User rejected signature')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(defaultAuthMock.resetError).toHaveBeenCalled();

    mockUseSiweAuth.mockReturnValue({ ...defaultAuthMock, status: 'idle' });
    rerender(<SafeSiweAuth />);
    expect(screen.getByText('Sign In With Ethereum')).toBeInTheDocument();
  });

  it('renders error state and handles Retry', () => {
    mockUseSiweAuth.mockReturnValue({ 
      ...defaultAuthMock, 
      status: 'error', 
      error: { message: 'Network failed' } 
    });
    
    const { rerender } = render(<SafeSiweAuth />);
    expect(screen.getByText('Sign-In Failed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(defaultAuthMock.begin).toHaveBeenCalled();

    mockUseSiweAuth.mockReturnValue({ ...defaultAuthMock, status: 'requesting-challenge', isBusy: true });
    rerender(<SafeSiweAuth />);
    expect(screen.getByText('Preparing Sign-In')).toBeInTheDocument();
  });

  it('renders authenticated state and calls clear on sign out', () => {
    mockUseSiweAuth.mockReturnValue({ 
      ...defaultAuthMock, 
      isAuthenticated: true, 
      address: '0xabc123' 
    });
    
    render(<SafeSiweAuth />);
    expect(screen.getByText('Securely Signed In')).toBeInTheDocument();
    expect(screen.getByText('0xabc123')).toBeInTheDocument();
    
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(defaultAuthMock.clear).toHaveBeenCalled();
  });
});
