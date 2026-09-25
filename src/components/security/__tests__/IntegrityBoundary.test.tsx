import React from 'react';
import { render, screen } from '@testing-library/react';
import { IntegrityBoundary } from '../IntegrityBoundary';
import { useAccount } from 'wagmi';

// Mock wagmi hook
jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
}));

// Mock config
jest.mock('@/config/wagmi', () => ({
  isSupportedChain: jest.fn(),
}));

import { isSupportedChain } from '@/config/wagmi';

describe('IntegrityBoundary', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('renders children when connected to a supported chain', () => {
    (useAccount as unknown as jest.Mock).mockReturnValue({
      isConnected: true,
      chainId: 10,
    });
    (isSupportedChain as unknown as jest.Mock).mockReturnValue(true);
    
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true });

    render(
      <IntegrityBoundary>
        <div data-testid="child">Valid Content</div>
      </IntegrityBoundary>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders children when not connected to any chain', () => {
    (useAccount as unknown as jest.Mock).mockReturnValue({
      isConnected: false,
      chainId: undefined,
    });
    
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true });

    render(
      <IntegrityBoundary>
        <div data-testid="child">Valid Content</div>
      </IntegrityBoundary>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('fails closed and displays alert on unsupported chain', () => {
    (useAccount as unknown as jest.Mock).mockReturnValue({
      isConnected: true,
      chainId: 1, // Mainnet (unsupported)
    });
    (isSupportedChain as unknown as jest.Mock).mockReturnValue(false);
    
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true });

    render(
      <IntegrityBoundary>
        <div data-testid="child">Valid Content</div>
      </IntegrityBoundary>
    );

    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Unsupported Network')).toBeInTheDocument();
    expect(screen.getByText(/Please switch your wallet to Optimism/i)).toBeInTheDocument();
  });

  it('fails closed when missing critical configuration in production', () => {
    (useAccount as unknown as jest.Mock).mockReturnValue({
      isConnected: true,
      chainId: 10,
    });
    (isSupportedChain as unknown as jest.Mock).mockReturnValue(true);
    
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = '';

    render(
      <IntegrityBoundary>
        <div data-testid="child">Valid Content</div>
      </IntegrityBoundary>
    );

    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('System Integrity Error')).toBeInTheDocument();
    expect(screen.getByText(/Critical configuration is missing/i)).toBeInTheDocument();
  });

  it('renders children when critical configuration is present in production', () => {
    (useAccount as unknown as jest.Mock).mockReturnValue({
      isConnected: true,
      chainId: 10,
    });
    (isSupportedChain as unknown as jest.Mock).mockReturnValue(true);
    
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = 'valid-id';

    render(
      <IntegrityBoundary>
        <div data-testid="child">Valid Content</div>
      </IntegrityBoundary>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
