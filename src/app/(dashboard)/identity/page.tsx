'use client';

import { useEffect, useState } from 'react';
import { WorldcoinVerificationPanel } from '@/components/features/worldcoin';
import { Button } from '@/components/ui/button';
import { Wallet, Info } from 'lucide-react';
import { useAccount } from '@/hooks/useAccount';

export default function IdentityPage() {
  const account = useAccount();
  const [walletAddress, setWalletAddress] = useState<string | undefined>();
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    setWalletAddress(account?.address);
  }, [account?.address]);

  const handleConnectWallet = () => {
    if (!account?.address) {
      setWalletAddress(undefined);
      return;
    }
    setWalletAddress(account.address);
  };

  const handleDisconnectWallet = () => {
    setWalletAddress(undefined);
    setIsVerified(false);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Identity Verification
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Verify your identity to unlock full access to TruthBounty and protect against Sybil attacks
          </p>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="size-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900 dark:text-blue-100">
              <p className="font-medium mb-1">Why verify with Worldcoin?</p>
              <p className="text-blue-700 dark:text-blue-300">
                Worldcoin uses zero-knowledge proofs to verify you&apos;re a unique human without revealing your identity. 
                This prevents fake accounts and manipulation while preserving your privacy.
              </p>
            </div>
          </div>
        </div>

        {/* Wallet Connection */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Step 1: Connect Wallet
          </h2>
          
          {walletAddress ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Connected Wallet
                </p>
                <p className="font-mono text-sm text-gray-900 dark:text-gray-100">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </p>
              </div>
              <Button
                onClick={handleDisconnectWallet}
                variant="outline"
                size="sm"
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Connect your Ethereum wallet to begin the verification process
              </p>
              <Button onClick={handleConnectWallet}>
                <Wallet />
                Connect Wallet
              </Button>
            </div>
          )}
        </div>

        {/* Worldcoin Verification */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Step 2: Verify Identity
          </h2>
          
          <WorldcoinVerificationPanel
            walletAddress={walletAddress}
            onVerificationChange={setIsVerified}
          />
        </div>

        {/* Benefits */}
        {isVerified && (
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              🎉 You&apos;re All Set!
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Your identity is now verified. You can now:
            </p>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex items-center gap-2">
                <span className="text-green-600 dark:text-green-400">✓</span>
                Submit and verify claims with higher stake limits
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 dark:text-green-400">✓</span>
                Earn higher reputation scores and rewards
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 dark:text-green-400">✓</span>
                Access priority verification and dispute resolution
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 dark:text-green-400">✓</span>
                Participate in governance decisions
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
