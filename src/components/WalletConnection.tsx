'use client';

import React, { useState } from 'react';
import { useAccount } from '@/hooks/useAccount';
import { useIsMounted } from '@/hooks/useIsMounted';
import { useWallet, type WalletLifecycleState } from '@/hooks/useWallet';
import { ConnectButton } from '@/components/ui/ConnectButton';
import styles from './style.module.css';

/**
 * Accessible, human-readable feedback for every wallet lifecycle state.
 * Rendered in an sr-only live region so screen-reader users get accurate
 * asynchronous feedback without any visual redesign.
 */
export function describeWalletState(
  state: WalletLifecycleState,
  error: Error | null,
): string {
  switch (state) {
    case 'connecting':
      return 'Connecting wallet. Please confirm in your wallet.';
    case 'reconnecting':
      return 'Reconnecting wallet.';
    case 'connected':
      return 'Wallet connected.';
    case 'unsupported-chain':
      return 'Wallet is connected to an unsupported network. Switch to Optimism.';
    case 'error':
      return `Wallet connection failed: ${error?.message ?? 'unknown error'}. Try connecting again.`;
    case 'disconnected':
    default:
      return 'Wallet not connected.';
  }
}

export function WalletConnection() {
  const mounted = useIsMounted();
  const account = useAccount();
  const wallet = useWallet();
  const [copyStatus, setCopyStatus] = useState('');

  const handleDisconnect = () => {
    wallet.disconnect();
  };

  const handleCopyAddress = async () => {
    if (account?.address && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(account.address);
        setCopyStatus('Address copied to clipboard');
        setTimeout(() => setCopyStatus(''), 3000);
      } catch (error) {
        console.error('Failed to copy address:', error);
      }
    }
  };

  return (
    <>
      {mounted && account ? (
        <div className={styles.displayData}>
          {/* Address button (accessible + keyboard friendly) */}
          <button
            type="button"
            className={styles.card}
            onClick={handleCopyAddress}
            aria-label={`Copy wallet address ${account.displayName}`}
          >
            {account.displayName}
          </button>

          {/* Disconnect button */}
          <button
            type="button"
            className={styles.disconnectButton}
            onClick={handleDisconnect}
            aria-label="Disconnect wallet"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <ConnectButton label="Connect Wallet" />
      )}

      {/* Screen-reader feedback for copy + connection lifecycle status */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {copyStatus}
      </span>
      <span
        className="sr-only"
        role="status"
        data-testid="wallet-connection-status"
        aria-live="polite"
        aria-atomic="true"
      >
        {describeWalletState(wallet.state, wallet.connectorError)}
      </span>
    </>
  );
}

export default WalletConnection;
