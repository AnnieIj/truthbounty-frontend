import React, { ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { isSupportedChain } from '@/config/wagmi';

interface IntegrityBoundaryProps {
  children: ReactNode;
}

export function IntegrityBoundary({ children }: IntegrityBoundaryProps) {
  const { chainId, isConnected } = useAccount();

  // Validate critical configuration
  const hasProjectId =
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID &&
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.trim().length > 0;
  
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !hasProjectId) {
    return (
      <div 
        role="alert" 
        className="flex flex-col items-center justify-center p-8 m-4 bg-red-50 border-2 border-red-500 rounded-lg text-red-900"
        aria-live="assertive"
      >
        <h2 className="text-xl font-bold mb-3">System Integrity Error</h2>
        <p className="mb-2">Critical configuration is missing. The application cannot proceed securely.</p>
        <p className="text-sm opacity-80">Missing: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</p>
      </div>
    );
  }

  if (isConnected && chainId && !isSupportedChain(chainId)) {
    return (
      <div 
        role="alert" 
        className="flex flex-col items-center justify-center p-8 m-4 bg-amber-50 border-2 border-amber-500 rounded-lg text-amber-900"
        aria-live="assertive"
      >
        <h2 className="text-xl font-bold mb-3">Unsupported Network</h2>
        <p>Please switch your wallet to Optimism or Optimism Sepolia to continue.</p>
        <p className="text-sm opacity-80 mt-2">The current chain is not supported for production integrity.</p>
      </div>
    );
  }

  return <>{children}</>;
}
